import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createLineWebhookPostRoute } from "../../../../app/api/webhook/line/route.js";
import { computeLineWebhookSignature, WEBHOOK_SIGNATURE_UNAUTHORIZED } from "./webhookSignature.js";

function makeReq(rawBody: string, headers?: HeadersInit): NextRequest {
  return new NextRequest("http://local/api/webhook/line", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...(headers ?? {}) }),
    body: rawBody
  });
}

test("POST /api/webhook/line missing signature returns 401 even for valid JSON with destination/events", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const res = await handler(makeReq('{"destination":"test","events":[]}'));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("POST /api/webhook/line missing signature returns 401 even for valid JSON with empty events", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const res = await handler(makeReq('{"events":[]}'));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
});

test("POST /api/webhook/line missing signature returns 401 even for malformed JSON", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const res = await handler(makeReq("{not valid json"));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
});

test("POST /api/webhook/line invalid signature returns 401 before payload parsing/validation", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const res = await handler(makeReq("{not valid json", { "x-line-signature": "bad" }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
});

test("POST /api/webhook/line valid signature with invalid payload can return 400 after signature passes", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const rawBody = '{"events":[{"type":"not-a-real-event"}]}';
  const signature = computeLineWebhookSignature("secret", rawBody);

  let called = 0;
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: {} as any }) as any,
    createLineWebhookHandlerImpl: () =>
      (async (_req: any, res: any) => {
        called += 1;
        return res.json({ error: "Invalid webhook payload" }, { status: 400 });
      }) as any
  });

  const res = await handler(makeReq(rawBody, { "x-line-signature": signature }));
  assert.equal(res.status, 400);
  assert.equal(called, 1);
});

test("POST /api/webhook/line valid signature with valid payload still accepted (200)", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const rawBody = '{"events":[{"timestamp":1,"source":{"userId":"U1"},"message":{"id":"m1","type":"text","text":"hi"}}]}';
  const signature = computeLineWebhookSignature("secret", rawBody);

  let called = 0;
  const handler = createLineWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: {} as any }) as any,
    createLineWebhookHandlerImpl: () =>
      (async (_req: any, res: any) => {
        called += 1;
        return res.json({ ok: true }, { status: 200 });
      }) as any
  });

  const res = await handler(makeReq(rawBody, { "x-line-signature": signature }));
  assert.equal(res.status, 200);
  assert.equal(called, 1);
});

