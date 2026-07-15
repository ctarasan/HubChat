import test from "node:test";
import assert from "node:assert/strict";
import {
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_SUBSCRIBED_FIELDS,
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  planFacebookPageWebhookSubscriptionUnion
} from "../facebookPageWebhookSubscription.js";
import {
  DEFAULT_TENANT_SUBSCRIBE_TARGET,
  assertSubscribeOpsTargetGuards,
  formatSubscribeOpsSummary,
  parseSubscribeOpsCliArgs,
  redactSubscribeOpsText,
  runSubscribeDefaultTenantFacebookPage
} from "./subscribeDefaultTenantFacebookPageOps.js";

const APP_ID = "943662608544465";
const PAGE_ID = DEFAULT_TENANT_SUBSCRIBE_TARGET.pageId;
const TENANT = DEFAULT_TENANT_SUBSCRIBE_TARGET.tenantId;
const FULL = [...FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS];
const MESSENGER = [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS];
const SECRET_TOKEN = "EAABLANDTOKENVALUE1234567890abcdefghijklmnopqrstuvwxyz";

function baseConnection(overrides: Partial<{
  id: string;
  tenantId: string;
  status: string;
  providerPageId: string | null;
  providerAccountName: string | null;
}> = {}) {
  return {
    id: "4bb0142e-7f0b-4860-aa63-37f5936e3c80",
    tenantId: TENANT,
    status: "READY",
    providerPageId: PAGE_ID,
    providerAccountName: "Connex Business Online",
    ...overrides
  };
}

function appsPayload(fields: string[]) {
  return {
    data: [
      {
        id: APP_ID,
        name: "HubChat",
        subscribed_fields: fields
      }
    ]
  };
}

function parseSubscribedFieldsFromUrl(url: string): string[] {
  const match = url.match(/subscribed_fields=([^&]+)/);
  if (!match?.[1]) return [];
  return decodeURIComponent(match[1])
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

test("plan: messages+feed appends missing Messenger fields", () => {
  const plan = planFacebookPageWebhookSubscriptionUnion({
    existingFields: ["messages", "feed"]
  });
  assert.deepEqual(plan.fieldsToAdd.sort(), [
    "message_deliveries",
    "message_echoes",
    "message_reads",
    "messaging_postbacks"
  ]);
  for (const required of FULL) {
    assert.equal(plan.finalFields.includes(required), true);
  }
});

test("plan: full Messenger adds feed only", () => {
  const plan = planFacebookPageWebhookSubscriptionUnion({
    existingFields: MESSENGER
  });
  assert.deepEqual(plan.fieldsToAdd, ["feed"]);
  assert.deepEqual(plan.finalFields, [...MESSENGER, "feed"]);
});

test("plan: feed only adds Messenger fields", () => {
  const plan = planFacebookPageWebhookSubscriptionUnion({
    existingFields: ["feed"]
  });
  assert.deepEqual(plan.fieldsToAdd, MESSENGER);
  assert.equal(plan.finalFields[0], "feed");
});

test("plan: preserves extras and strips duplicates/whitespace", () => {
  const plan = planFacebookPageWebhookSubscriptionUnion({
    existingFields: ["messages", " messages ", "", "conversations", "feed"]
  });
  assert.equal(plan.existingFields.includes("conversations"), true);
  assert.equal(plan.finalFields.includes("conversations"), true);
  assert.equal(plan.finalFields.filter((f) => f === "messages").length, 1);
});

test("plan: comments does not satisfy feed", () => {
  const plan = planFacebookPageWebhookSubscriptionUnion({
    existingFields: [...MESSENGER, "comments"]
  });
  assert.equal(plan.fieldsToAdd.includes("feed"), true);
  assert.equal(plan.alreadyComplete, false);
});

test("cli: default is dry-run; --apply enables write mode", () => {
  assert.deepEqual(parseSubscribeOpsCliArgs(["node", "script.mjs"]), {
    help: false,
    mode: "dry-run"
  });
  assert.equal(parseSubscribeOpsCliArgs(["node", "script.mjs", "--apply"]).mode, "apply");
});

test("guards: refuse SmartKorp and page mismatch", () => {
  assert.throws(
    () =>
      assertSubscribeOpsTargetGuards({
        appId: APP_ID,
        connection: baseConnection({
          tenantId: DEFAULT_TENANT_SUBSCRIBE_TARGET.smartkorpTenantId
        })
      }),
    /refusing_smartkorp/
  );
  assert.throws(
    () =>
      assertSubscribeOpsTargetGuards({
        appId: APP_ID,
        connection: baseConnection({ providerPageId: "999" })
      }),
    /unexpected_page_id/
  );
});

test("redact: token never appears in operator text", () => {
  const scrubbed = redactSubscribeOpsText(
    `failed access_token=${SECRET_TOKEN} raw=${SECRET_TOKEN}`,
    [SECRET_TOKEN]
  );
  assert.equal(scrubbed.includes(SECRET_TOKEN), false);
  assert.match(scrubbed, /REDACTED/);
});

test("dry-run: zero POST even when fields incomplete", async () => {
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      posts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(["messages", "feed"])), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "dry-run",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.writePerformed, "NO");
  assert.equal(result.summary.verification, "NOT RUN");
  assert.equal(result.summary.action, "NO WRITE");
  assert.equal(posts, 0);
  assert.equal(result.summaryText.includes(SECRET_TOKEN), false);
  assert.match(formatSubscribeOpsSummary(result.summary), /Mode: DRY RUN/);
});

test("dry-run: initial GET failure → zero POST and non-zero exit", async () => {
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      posts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "denied", code: 200 } }), {
      status: 403
    });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "dry-run",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(posts, 0);
  assert.equal(result.summary.writePerformed, "NO");
  assert.match(result.summary.error || "", /refusing a destructive|Could not read existing/i);
});

test("apply: already complete skips POST", async () => {
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      posts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(FULL)), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(posts, 0);
  assert.equal(result.summary.writePerformed, "NO");
  assert.equal(result.summary.verification, "PASS");
  assert.match(result.summary.action || "", /SKIP POST/);
});

test("apply: Messenger-only POSTs union including feed", async () => {
  let stored: string[] = [...MESSENGER];
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    if (method === "POST" && url.includes("/subscribed_apps")) {
      posts += 1;
      const fields = parseSubscribedFieldsFromUrl(url);
      assert.deepEqual(fields, [...MESSENGER, "feed"]);
      stored = fields;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(stored)), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(posts, 1);
  assert.equal(result.summary.writePerformed, "YES");
  assert.equal(result.summary.verification, "PASS");
  assert.equal(result.summary.finalFields.includes("feed"), true);
  assert.equal(result.summaryText.includes(SECRET_TOKEN), false);
});

test("apply: POST failure exits non-zero without claiming success", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    if (method === "POST") {
      return new Response(JSON.stringify({ error: { message: `token ${SECRET_TOKEN}` } }), {
        status: 400
      });
    }
    return new Response(JSON.stringify(appsPayload(MESSENGER)), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.verification, "FAIL");
  assert.equal(result.summaryText.includes(SECRET_TOKEN), false);
});

test("apply: final GET missing feed fails verification", async () => {
  let getCount = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: PAGE_ID, name: "Connex" }), { status: 200 });
    }
    if (method === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    getCount += 1;
    // First GET (before) has messenger only; after POST still missing feed → verify fail
    if (getCount === 1) {
      return new Response(JSON.stringify(appsPayload(MESSENGER)), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(MESSENGER)), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.verification, "FAIL");
  assert.match(result.summary.error || "", /incomplete|feed/i);
});

test("apply: page token mismatch refuses before POST", async () => {
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      posts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/me?")) {
      return new Response(JSON.stringify({ id: "000000000000000", name: "Wrong" }), {
        status: 200
      });
    }
    return new Response(JSON.stringify(appsPayload(MESSENGER)), { status: 200 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection(),
    fetchImpl
  });
  assert.equal(result.ok, false);
  assert.equal(posts, 0);
  assert.match(result.summary.error || "", /different_page|mismatch/i);
});

test("guards via run: SmartKorp connection refused with zero Graph writes", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response("{}", { status: 500 });
  }) as typeof fetch;

  const result = await runSubscribeDefaultTenantFacebookPage({
    mode: "apply",
    graphVersion: "v25.0",
    appId: APP_ID,
    pageAccessToken: SECRET_TOKEN,
    connection: baseConnection({
      tenantId: DEFAULT_TENANT_SUBSCRIBE_TARGET.smartkorpTenantId
    }),
    fetchImpl
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.match(result.summary.error || "", /smartkorp/i);
});
