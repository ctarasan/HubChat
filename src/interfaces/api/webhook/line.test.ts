import test from "node:test";
import assert from "node:assert/strict";
import { createLineWebhookHandler } from "./line.js";
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

function makeReq(body: unknown): { json: () => Promise<unknown>; headers: Headers } {
  return {
    json: async () => body,
    headers: new Headers({ "x-tenant-id": "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f" })
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

test("line webhook includes sender display name payload when available", async () => {
  process.env.LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? "secret";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => new Response(JSON.stringify({ displayName: "Line Name" }), { status: 200 })) as any;
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
