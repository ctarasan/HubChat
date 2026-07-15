import test from "node:test";
import assert from "node:assert/strict";
import {
  FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS,
  FACEBOOK_PAGE_SUBSCRIBED_FIELDS
} from "../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  subscribeAndVerifyFacebookPageWebhook
} from "./facebookPageWebhookSubscription.js";

const APP_ID = "943662608544465";
const PAGE_ID = "541846535686129";
const FULL_REQUIRED = [...FACEBOOK_PAGE_REQUIRED_SUBSCRIBED_FIELDS];
const MESSENGER_ONLY = [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS];

function parseSubscribedFieldsFromUrl(url: string): string[] {
  const match = url.match(/subscribed_fields=([^&]+)/);
  if (!match?.[1]) return [];
  return decodeURIComponent(match[1])
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

function appsPayload(fields: string[]) {
  return {
    data: [
      {
        id: APP_ID,
        name: "SmartKorp Messenger",
        subscribed_fields: fields
      }
    ]
  };
}

test("subscribe+verify GETs first, POSTs union, then verifies (messages+feed → full)", async () => {
  const calls: Array<{ method: string; fields?: string[] }> = [];
  let stored = ["messages", "feed"];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/subscribed_apps") && method === "POST") {
      const fields = parseSubscribedFieldsFromUrl(url);
      calls.push({ method, fields });
      assert.deepEqual(fields, [
        "messages",
        "feed",
        "messaging_postbacks",
        "message_deliveries",
        "message_reads",
        "message_echoes"
      ]);
      stored = fields;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/subscribed_apps") && method === "GET") {
      calls.push({ method });
      return new Response(JSON.stringify(appsPayload(stored)), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(calls.filter((c) => c.method === "GET").length, 2);
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  for (const required of FULL_REQUIRED) {
    assert.equal(result.subscribedFields.includes(required), true);
  }
});

test("subscribe+verify Connex Messenger-only gains feed and preserves all", async () => {
  let stored: string[] = [...MESSENGER_ONLY];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      const fields = parseSubscribedFieldsFromUrl(url);
      assert.deepEqual(fields, [...MESSENGER_ONLY, "feed"]);
      stored = fields;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(stored)), { status: 200 });
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.subscribedFields.includes("feed"), true);
});

test("subscribe+verify preserves extras like conversations", async () => {
  let stored: string[] = [...MESSENGER_ONLY, "conversations"];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      const fields = parseSubscribedFieldsFromUrl(url);
      assert.equal(fields.includes("conversations"), true);
      assert.equal(fields.includes("feed"), true);
      stored = fields;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(stored)), { status: 200 });
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.subscribedFields.includes("conversations"), true);
});

test("subscribe+verify refuses POST when initial GET fails", async () => {
  let posted = false;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      posted = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "denied", code: 200 } }), {
      status: 403
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      subscribeAndVerifyFacebookPageWebhook({
        graphVersion: "v25.0",
        pageId: PAGE_ID,
        pageAccessToken: "page-token",
        expectedAppId: APP_ID,
        fetchImpl
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.listFailed);
      return true;
    }
  );
  assert.equal(posted, false);
});

test("subscribe+verify app missing posts required set including feed (new subscription)", async () => {
  let stored: string[] = [];
  let getCount = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      const fields = parseSubscribedFieldsFromUrl(url);
      assert.deepEqual(fields, FULL_REQUIRED);
      stored = fields;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    getCount += 1;
    if (getCount === 1) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(stored)), { status: 200 });
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.subscribedFields.includes("feed"), true);
});

test("subscribe+verify fails on POST failure", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: false }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(["messages", "feed"])), { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      subscribeAndVerifyFacebookPageWebhook({
        graphVersion: "v25.0",
        pageId: PAGE_ID,
        pageAccessToken: "page-token",
        expectedAppId: APP_ID,
        fetchImpl
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.subscribeFailed);
      return true;
    }
  );
});

test("subscribe+verify fails when final GET is missing feed", async () => {
  let getCount = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    getCount += 1;
    if (getCount === 1) {
      return new Response(JSON.stringify(appsPayload(MESSENGER_ONLY)), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(MESSENGER_ONLY)), { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      subscribeAndVerifyFacebookPageWebhook({
        graphVersion: "v25.0",
        pageId: PAGE_ID,
        pageAccessToken: "page-token",
        expectedAppId: APP_ID,
        fetchImpl
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /incomplete/i);
      return true;
    }
  );
});

test("subscribe+verify fails when final GET is missing a Messenger field", async () => {
  let getCount = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    getCount += 1;
    const partial = ["messages", "feed"];
    return new Response(JSON.stringify(appsPayload(partial)), { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      subscribeAndVerifyFacebookPageWebhook({
        graphVersion: "v25.0",
        pageId: PAGE_ID,
        pageAccessToken: "page-token",
        expectedAppId: APP_ID,
        fetchImpl
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /incomplete/i);
      return true;
    }
  );
});

test("subscribe+verify fails on post-POST GET failure", async () => {
  let getCount = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    getCount += 1;
    if (getCount === 1) {
      return new Response(JSON.stringify(appsPayload(["messages", "feed"])), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "denied", code: 200 } }), { status: 403 });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      subscribeAndVerifyFacebookPageWebhook({
        graphVersion: "v25.0",
        pageId: PAGE_ID,
        pageAccessToken: "page-token",
        expectedAppId: APP_ID,
        fetchImpl
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES.verifyFailed);
      return true;
    }
  );
});

test("subscribe+verify skipPostIfAlreadyComplete avoids unnecessary POST", async () => {
  let posts = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      posts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify(appsPayload(FULL_REQUIRED)), { status: 200 });
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    skipPostIfAlreadyComplete: true,
    fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.posted, false);
  assert.equal(posts, 0);
  for (const required of FULL_REQUIRED) {
    assert.equal(result.subscribedFields.includes(required), true);
  }
});
