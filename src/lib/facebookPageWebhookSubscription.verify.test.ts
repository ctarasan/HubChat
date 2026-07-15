import test from "node:test";
import assert from "node:assert/strict";
import { FACEBOOK_PAGE_SUBSCRIBED_FIELDS } from "../infrastructure/adapters/meta/facebookGraphOAuth.js";
import {
  FACEBOOK_WEBHOOK_SUBSCRIPTION_MESSAGES,
  subscribeAndVerifyFacebookPageWebhook
} from "./facebookPageWebhookSubscription.js";

const APP_ID = "943662608544465";
const PAGE_ID = "541846535686129";

function fullFieldsPayload() {
  return {
    data: [
      {
        id: APP_ID,
        name: "SmartKorp Messenger",
        subscribed_fields: [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS]
      }
    ]
  };
}

test("subscribe+verify succeeds when POST ok and GET returns full Connex-style fields", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/subscribed_apps") && method === "POST") {
      assert.match(url, /subscribed_fields=messages%2Cmessaging_postbacks/);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/subscribed_apps") && method === "GET") {
      assert.match(url, /fields=id%2Cname%2Csubscribed_fields/);
      return new Response(JSON.stringify(fullFieldsPayload()), { status: 200 });
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
  assert.equal(calls.some((c) => c.method === "POST"), true);
  assert.equal(calls.some((c) => c.method === "GET"), true);
});

test("subscribe+verify fails when GET returns only messages+feed after POST", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        data: [{ id: APP_ID, name: "App", subscribed_fields: ["messages", "feed"] }]
      }),
      { status: 200 }
    );
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

test("subscribe+verify fails on POST failure", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: false }), { status: 200 });
    }
    return new Response(JSON.stringify(fullFieldsPayload()), { status: 200 });
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

test("subscribe+verify fails on GET failure", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
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

test("extra Meta fields after required set still verify", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        data: [
          {
            id: APP_ID,
            name: "App",
            subscribed_fields: [...FACEBOOK_PAGE_SUBSCRIBED_FIELDS, "feed"]
          }
        ]
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  const result = await subscribeAndVerifyFacebookPageWebhook({
    graphVersion: "v25.0",
    pageId: PAGE_ID,
    pageAccessToken: "page-token",
    expectedAppId: APP_ID,
    fetchImpl
  });
  assert.equal(result.ok, true);
});
