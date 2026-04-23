#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { getValidationProfile } from "../src/loadtest/validationProfiles.ts";
import { safeRate } from "../src/loadtest/validationMath.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback = undefined) => {
    const pref = `--${name}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : fallback;
  };
  return {
    profile: getArg("profile", "medium"),
    loadtestReport: getArg("loadtest-report", "tmp/loadtest-result.json"),
    output: getArg("output", "tmp/validation-summary.json"),
    workerMetricsUrl: getArg("worker-metrics-url", process.env.WORKER_METRICS_URL ?? "")
  };
}

async function fetchWorkerMetrics(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch worker metrics: ${res.status}`);
  return await res.json();
}

function passFail(value, max) {
  return { value, max, pass: value <= max };
}

async function main() {
  const args = parseArgs();
  const profile = getValidationProfile(args.profile);
  const report = JSON.parse(await readFile(args.loadtestReport, "utf8"));
  const workerMetrics = await fetchWorkerMetrics(args.workerMetricsUrl).catch(() => null);

  const queueFailed = Number(workerMetrics?.counters?.queueJobsFailed ?? 0);
  const queueProcessed = Number(workerMetrics?.counters?.queueJobsProcessed ?? 0);
  const deadLettered =
    Number(workerMetrics?.counters?.queueJobsDeadLettered ?? 0) +
    Number(workerMetrics?.counters?.outboxEventsDeadLettered ?? 0);

  const retryRate = safeRate(queueFailed, Math.max(1, queueProcessed + queueFailed));
  const deadLetterRate = safeRate(deadLettered, Math.max(1, queueProcessed + deadLettered));

  const results = {
    profile: profile.name,
    generatedAt: new Date().toISOString(),
    checks: {
      queueLagMsP95: passFail(Number(workerMetrics?.gauges?.queueLagMs ?? 0), profile.slo.queueLagMsP95Max),
      outboxLagMsP95: passFail(Number(workerMetrics?.gauges?.outboxLagMs ?? 0), profile.slo.outboxLagMsP95Max),
      webhookLatencyP95: passFail(Number(report?.aggregate?.webhookLatency?.p95 ?? 0), profile.slo.webhookLatencyMsP95Max),
      webhookLatencyP99: passFail(Number(report?.aggregate?.webhookLatency?.p99 ?? 0), profile.slo.webhookLatencyMsP99Max),
      outboundLatencyP95: passFail(Number(report?.aggregate?.outboundLatency?.p95 ?? 0), profile.slo.outboundLatencyMsP95Max),
      outboundLatencyP99: passFail(Number(report?.aggregate?.outboundLatency?.p99 ?? 0), profile.slo.outboundLatencyMsP99Max),
      retryRate: passFail(retryRate, profile.slo.retryRateMax),
      deadLetterRate: passFail(deadLetterRate, profile.slo.deadLetterRateMax)
    },
    workerMetrics: workerMetrics ?? null,
    loadtestReportPath: args.loadtestReport
  };
  const allPass = Object.values(results.checks).every((x) => x.pass);
  const output = { ...results, verdict: allPass ? "PASS" : "FAIL" };
  await writeFile(args.output, JSON.stringify(output, null, 2), "utf8");
  console.log(`Validation summary written to ${args.output}`);
  console.log(`Verdict: ${output.verdict}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
