import test from "node:test";
import assert from "node:assert/strict";
import { createInstagramWebhookHandler, verifyInstagramWebhook } from "./instagram.js";
import type { WebhookEventRepository } from "../../../domain/ports.js";

class FakeWebhookRepo implements WebhookEventRepository {
  public atomicCalls = 0;
  public lastOutboxPayload: Record<string, unknown> | null = null;
  async saveIfNotExists(_input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
  }): Promise<"inserted" | "duplicate"> {
    return "inserted";
  }
  async saveInboundAndOutboxIfNotExists(input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
    outboxTopic: string;
    outboxPayload: Record<string, unknown>;
    outboxIdempotencyKey: string;
  }): Promise<"inserted" | "duplicate"> {
    this.atomicCalls += 1;
    this.lastOutboxPayload = input.outboxPayload;
    return "inserted";
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

test("instagram webhook verify challenge works", () => {
  process.env.INSTAGRAM_VERIFY_TOKEN = "ig-verify";
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "ig-verify",
    "hub.challenge": "challenge-123"
  });
  const result = verifyInstagramWebhook(params);
  assert.equal(result.ok, true);
  assert.equal(result.body, "challenge-123");
});

test("instagram webhook normalizes text and enqueues inbound event", async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  process.env.META_GRAPH_VERSION = "v25.0";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            recipient: { id: "ig-biz-1" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-1", text: "hello from ig" }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
  assert.equal(repo.lastOutboxPayload?.messageType, "TEXT");
  assert.equal(repo.lastOutboxPayload?.externalUserId, "ig-user-1");
  assert.equal(repo.lastOutboxPayload?.channelThreadId, "ig:user:ig-user-1");
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_DM");
  assert.equal((repo.lastOutboxPayload?.metadataJson as Record<string, unknown>)?.instagramRecipientId, "ig-biz-1");
});

test("instagram webhook accepts page object payload and enqueues inbound event", async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "page",
    entry: [
      {
        changes: [
          {
            value: {
              messaging: [
                {
                  sender: { id: "ig-user-2" },
                  recipient: { id: "ig-biz-2" },
                  timestamp: Date.now(),
                  message: { mid: "ig-mid-2", text: "hello from changes" }
                }
              ]
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
  assert.equal(repo.lastOutboxPayload?.channelThreadId, "ig:user:ig-user-2");
});

test("instagram webhook ignores media-only event in phase 1", async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-media", attachments: [{ type: "image" }] }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 0);
});
