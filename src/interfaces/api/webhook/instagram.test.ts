import test from "node:test";
import assert from "node:assert/strict";
import { createInstagramWebhookHandler, verifyInstagramWebhook } from "./instagram.js";
import type { WebhookPostRequest } from "./line.js";
import {
  computeMetaHubSignature256,
  WEBHOOK_SIGNATURE_MISCONFIGURED,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";
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

function makeReq(
  body: unknown,
  options?: { appSecret?: string; signature?: string | null }
): WebhookPostRequest {
  const appSecret = options?.appSecret ?? process.env.META_APP_SECRET ?? "meta-app-secret";
  const rawBody = JSON.stringify(body);
  const headers = new Headers({ "x-tenant-id": "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f" });
  if (options?.signature === null) {
    // omit header
  } else if (typeof options?.signature === "string") {
    headers.set("x-hub-signature-256", options.signature);
  } else {
    const digest = computeMetaHubSignature256(appSecret, rawBody).toString("hex");
    headers.set("x-hub-signature-256", `sha256=${digest}`);
  }
  return {
    rawBody,
    headers,
    json: async () => JSON.parse(rawBody) as unknown
  };
}

function setMetaAppSecret(secret: string): void {
  process.env.META_APP_SECRET = secret;
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
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

test("instagram webhook rejects missing meta signature", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createInstagramWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "instagram",
    entry: [{ messaging: [{ sender: { id: "ig-user-1" }, message: { mid: "ig-mid-x", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { signature: null }), res);
  assert.equal(response.status, 401);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
});

test("instagram webhook rejects invalid meta signature", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createInstagramWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "instagram",
    entry: [{ messaging: [{ sender: { id: "ig-user-1" }, message: { mid: "ig-mid-y", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { signature: "sha256=00" }), res);
  assert.equal(response.status, 401);
});

test("instagram webhook rejects when meta app secret is missing", async () => {
  delete process.env.META_APP_SECRET;
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
  const handler = createInstagramWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "instagram",
    entry: [{ messaging: [{ sender: { id: "ig-user-1" }, message: { mid: "ig-mid-z", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { appSecret: "" }), res);
  assert.equal(response.status, 401);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
});

test("instagram webhook normalizes text and enqueues inbound event", async () => {
  setMetaAppSecret("meta-app-secret");
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
  setMetaAppSecret("meta-app-secret");
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

test("instagram webhook normalizes inbound image and enqueues with media URLs", async () => {
  setMetaAppSecret("meta-app-secret");
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
            recipient: { id: "ig-biz-1" },
            timestamp: Date.now(),
            message: {
              mid: "ig-mid-media",
              attachments: [{ type: "image", payload: { url: "https://cdn.instagram.example/i.jpg" } }]
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.messageType, "IMAGE");
  assert.equal(repo.lastOutboxPayload?.mediaUrl, "https://cdn.instagram.example/i.jpg");
  assert.equal(repo.lastOutboxPayload?.previewUrl, "https://cdn.instagram.example/i.jpg");
});

test("instagram webhook ignores unsupported attachment shapes (no HTTPS image URL)", async () => {
  setMetaAppSecret("meta-app-secret");
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
