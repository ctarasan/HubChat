import test from "node:test";
import assert from "node:assert/strict";
import { createLineWebhookHandler, type WebhookPostRequest } from "./line.js";
import {
  computeLineWebhookSignature,
  WEBHOOK_SIGNATURE_MISCONFIGURED,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";
import type { WebhookEventRepository } from "../../../domain/ports.js";

class FakeWebhookRepo implements WebhookEventRepository {
  public atomicCalls = 0;
  public lastOutboxPayload: Record<string, unknown> | null = null;
  private readonly outcomes: Array<"inserted" | "duplicate">;
  constructor(outcomes: Array<"inserted" | "duplicate">) {
    this.outcomes = outcomes;
  }
  async saveIfNotExists(_input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
  }): Promise<"inserted" | "duplicate"> {
    return "inserted";
  }
  async saveInboundAndOutboxIfNotExists(_input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
    outboxTopic: string;
    outboxPayload: Record<string, unknown>;
    outboxIdempotencyKey: string;
  }): Promise<"inserted" | "duplicate"> {
    this.lastOutboxPayload = _input.outboxPayload;
    this.atomicCalls += 1;
    return this.outcomes.shift() ?? "duplicate";
  }
}

function makeReq(
  body: unknown,
  options?: { secret?: string; signature?: string | null }
): WebhookPostRequest {
  const secret = options?.secret ?? process.env.LINE_CHANNEL_SECRET ?? "secret";
  const rawBody = JSON.stringify(body);
  const headers = new Headers({ "x-tenant-id": "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f" });
  if (options?.signature === null) {
    // omit header
  } else if (typeof options?.signature === "string") {
    headers.set("x-line-signature", options.signature);
  } else {
    headers.set("x-line-signature", computeLineWebhookSignature(secret, rawBody));
  }
  return {
    rawBody,
    headers,
    json: async () => JSON.parse(rawBody) as unknown
  };
}

const res = {
  json: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), { status: init?.status ?? 200 })
};

test("duplicate inbound webhook does not create duplicate work", async () => {
  process.env.LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "token";

  const repo = new FakeWebhookRepo(["inserted", "duplicate"]);
  const handler = createLineWebhookHandler({
    webhookRepository: repo
  });

  const payload = {
    events: [
      {
        timestamp: Date.now(),
        replyToken: "reply-token",
        source: { userId: "U1234" },
        message: { id: "m-1", type: "text", text: "hello" }
      }
    ]
  };

  const first = await handler(makeReq(payload), res);
  const second = await handler(makeReq(payload), res);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(repo.atomicCalls, 2);
  const secondBody = JSON.parse(await second.text()) as { duplicate?: boolean };
  assert.equal(Boolean(secondBody.duplicate), true);
});

test("line webhook rejects missing signature", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookHandler({ webhookRepository: new FakeWebhookRepo(["inserted"]) });
  const payload = {
    events: [{ timestamp: Date.now(), source: { userId: "U1" }, message: { id: "m-1", type: "text", text: "hi" } }]
  };
  const response = await handler(makeReq(payload, { signature: null }), res);
  assert.equal(response.status, 401);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(body.error?.includes("secret"), false);
});

test("line webhook rejects invalid signature", async () => {
  process.env.LINE_CHANNEL_SECRET = "secret";
  const handler = createLineWebhookHandler({ webhookRepository: new FakeWebhookRepo(["inserted"]) });
  const payload = {
    events: [{ timestamp: Date.now(), source: { userId: "U1" }, message: { id: "m-2", type: "text", text: "hi" } }]
  };
  const response = await handler(makeReq(payload, { signature: "not-valid" }), res);
  assert.equal(response.status, 401);
});

test("line webhook rejects when channel secret is missing", async () => {
  const prior = process.env.LINE_CHANNEL_SECRET;
  delete process.env.LINE_CHANNEL_SECRET;
  try {
    const handler = createLineWebhookHandler({ webhookRepository: new FakeWebhookRepo(["inserted"]) });
    const payload = {
      events: [{ timestamp: Date.now(), source: { userId: "U1" }, message: { id: "m-3", type: "text", text: "hi" } }]
    };
    const response = await handler(makeReq(payload, { secret: "" }), res);
    assert.equal(response.status, 401);
    const body = JSON.parse(await response.text()) as { error?: string };
    assert.equal(body.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
  } finally {
    if (prior !== undefined) process.env.LINE_CHANNEL_SECRET = prior;
  }
});

test("line webhook includes sender display name payload when available", async () => {
  process.env.LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) =>
    new Response(
      JSON.stringify({ displayName: "Line Name", pictureUrl: "https://profile.line-scdn.net/0hZ" }),
      { status: 200 }
    )) as any;
  try {
    const repo = new FakeWebhookRepo(["inserted"]);
    const handler = createLineWebhookHandler({ webhookRepository: repo });
    const payload = {
      events: [
        {
          timestamp: Date.now(),
          replyToken: "reply-token",
          source: { userId: "U1234" },
          message: { id: "m-9", type: "text", text: "hello" }
        }
      ]
    };
    const response = await handler(makeReq(payload), res);
    assert.equal(response.status, 200);
    assert.equal(repo.lastOutboxPayload?.senderDisplayName, "Line Name");
    assert.equal(repo.lastOutboxPayload?.senderProfileImageUrl, "https://profile.line-scdn.net/0hZ");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
