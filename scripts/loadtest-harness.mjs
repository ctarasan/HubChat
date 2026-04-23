#!/usr/bin/env node
import { toExecutionCounts } from "../src/loadtest/validationProfiles.ts";
import { percentile } from "../src/loadtest/validationMath.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function required(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback = undefined) => {
    const pref = `--${name}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : fallback;
  };
  return {
    profile: getArg("profile", process.env.LOADTEST_PROFILE ?? "medium"),
    output: getArg("output", process.env.LOADTEST_OUTPUT ?? "tmp/loadtest-result.json"),
    clientConcurrency: Number(getArg("client-concurrency", process.env.LOADTEST_CLIENT_CONCURRENCY ?? "25"))
  };
}

async function postJson(url, token, tenantId, body) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (tenantId) headers["x-tenant-id"] = tenantId;
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return { status: res.status, text: await res.text(), latencyMs: Date.now() - startedAt };
}

async function runWithConcurrency(tasks, concurrency) {
  const safeConcurrency = Math.max(1, concurrency);
  let cursor = 0;
  const results = [];
  const workers = Array.from({ length: Math.min(safeConcurrency, tasks.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) break;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeLatencies(values) {
  return {
    count: values.length,
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : 0
  };
}

async function main() {
  const cli = parseArgs();
  const baseUrl = required("HUB_CHAT_BASE_URL");
  const tenantId = required("HUB_CHAT_TENANT_ID");
  const token = required("HUB_CHAT_ACCESS_TOKEN");
  const leadId = required("HUB_CHAT_LEAD_ID");
  const conversationId = required("HUB_CHAT_CONVERSATION_ID");
  const channelThreadId = required("HUB_CHAT_CHANNEL_THREAD_ID");

  if (!baseUrl || !tenantId) {
    console.error("Missing HUB_CHAT_BASE_URL or HUB_CHAT_TENANT_ID");
    process.exit(1);
  }

  const { profile, counts } = toExecutionCounts(cli.profile);
  console.log("Load profile:", profile.name, { idleConnectedUsers: profile.idleConnectedUsers, ...counts });

  // Scenario 1: burst inbound webhook events (LINE format)
  const inboundBody = (id) => ({
    events: [
      {
        timestamp: Date.now(),
        replyToken: `reply-${id}`,
        source: { userId: `U${id}` },
        message: { id: `m-${id}`, type: "text", text: `loadtest inbound ${id}` }
      }
    ]
  });

  const inboundTasks = [];
  for (let i = 0; i < counts.inboundBurstEvents; i += 1) {
    inboundTasks.push(() => postJson(`${baseUrl}/api/webhook/line`, token, tenantId, inboundBody(i + 1)));
  }
  const burstResults = await runWithConcurrency(inboundTasks, cli.clientConcurrency);

  // Scenario 2: duplicate deliveries on inbound.
  const duplicateInboundResults = [];
  for (let i = 0; i < counts.duplicateInbound; i += 1) {
    duplicateInboundResults.push(await postJson(`${baseUrl}/api/webhook/line`, token, tenantId, inboundBody(1)));
  }

  // Scenario 3: sustained outbound sends.
  const outboundResults = [];
  const duplicateOutboundResults = [];
  if (token && leadId && conversationId && channelThreadId) {
    const outboundTasks = [];
    for (let i = 0; i < counts.outboundSustainedEvents; i += 1) {
      outboundTasks.push(() =>
        postJson(`${baseUrl}/api/messages/send`, token, tenantId, {
          tenantId,
          leadId,
          conversationId,
          channel: "LINE",
          channelThreadId,
          content: `loadtest outbound ${i + 1}`
        })
      );
    }
    outboundResults.push(...(await runWithConcurrency(outboundTasks, cli.clientConcurrency)));

    // Scenario 4: duplicate outbound requests.
    const duplicatePayload = {
      tenantId,
      leadId,
      conversationId,
      channel: "LINE",
      channelThreadId,
      content: "loadtest duplicate outbound"
    };
    for (let i = 0; i < counts.duplicateOutbound; i += 1) {
      duplicateOutboundResults.push(await postJson(`${baseUrl}/api/messages/send`, token, tenantId, duplicatePayload));
    }
  } else {
    console.warn("Skipping outbound scenarios: set HUB_CHAT_ACCESS_TOKEN, HUB_CHAT_LEAD_ID, HUB_CHAT_CONVERSATION_ID, HUB_CHAT_CHANNEL_THREAD_ID");
  }

  const byStatus = (results) =>
    results.reduce((acc, r) => {
      const k = String(r.status);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const allWebhookLatencies = [...burstResults, ...duplicateInboundResults].map((x) => x.latencyMs);
  const allOutboundLatencies = [...outboundResults, ...duplicateOutboundResults].map((x) => x.latencyMs);
  const result = {
    generatedAt: new Date().toISOString(),
    profile: profile.name,
    idleConnectedUsers: profile.idleConnectedUsers,
    counts,
    scenarios: {
      inboundBurst: { status: byStatus(burstResults), latency: summarizeLatencies(burstResults.map((x) => x.latencyMs)) },
      inboundDuplicate: {
        status: byStatus(duplicateInboundResults),
        latency: summarizeLatencies(duplicateInboundResults.map((x) => x.latencyMs))
      },
      outboundSustained: {
        status: byStatus(outboundResults),
        latency: summarizeLatencies(outboundResults.map((x) => x.latencyMs))
      },
      outboundDuplicate: {
        status: byStatus(duplicateOutboundResults),
        latency: summarizeLatencies(duplicateOutboundResults.map((x) => x.latencyMs))
      }
    },
    aggregate: {
      webhookLatency: summarizeLatencies(allWebhookLatencies),
      outboundLatency: summarizeLatencies(allOutboundLatencies)
    }
  };

  await mkdir(dirname(cli.output), { recursive: true });
  await writeFile(cli.output, JSON.stringify(result, null, 2), "utf8");
  console.log(`Load test harness completed. Report: ${cli.output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
