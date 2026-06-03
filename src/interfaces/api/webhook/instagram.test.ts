import test from "node:test";
import assert from "node:assert/strict";
import {
  createInstagramWebhookHandler,
  extractInstagramWebhookShapeDiagnostics,
  verifyInstagramWebhook
} from "./instagram.js";
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
  public lastIdempotencyKey: string | null = null;
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
    this.lastIdempotencyKey = input.idempotencyKey;
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

test("instagram webhook rejects malformed meta signature header", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createInstagramWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = { object: "instagram", entry: [{ messaging: [] }] };
  const response = await handler(makeReq(payload, { signature: "not-sha256-format" }), res);
  assert.equal(response.status, 401);
});

test("instagram webhook accepts FACEBOOK_APP_SECRET for signature verification", async () => {
  process.env.FACEBOOK_APP_SECRET = "fb-app-secret";
  delete process.env.META_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-fb-secret" },
            recipient: { id: "ig-biz-1" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-fb-secret", text: "signed with facebook app secret" }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload, { appSecret: "fb-app-secret" }), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
});

test("instagram webhook valid signature with invalid JSON returns 400 after signature passes", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createInstagramWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const rawBody = "{not valid json";
  const digest = computeMetaHubSignature256("meta-app-secret", rawBody).toString("hex");
  const req: WebhookPostRequest = {
    rawBody,
    headers: new Headers({ "x-hub-signature-256": `sha256=${digest}`, "x-tenant-id": "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f" }),
    json: async () => JSON.parse(rawBody) as unknown
  };
  const response = await handler(req, res);
  assert.equal(response.status, 400);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, "Invalid webhook payload");
  assert.equal(JSON.stringify(body).includes("{not valid json"), false);
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

test("extractInstagramWebhookShapeDiagnostics omits sensitive payload values", () => {
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "89520963556172",
        time: 1_700_000_000,
        changes: [
          {
            field: "comments",
            value: {
              from: { id: "17841400000000111", username: "secret-user" },
              id: "17890000000000001",
              text: "secret comment text"
            }
          }
        ]
      }
    ]
  };
  const diagnostics = extractInstagramWebhookShapeDiagnostics(payload);
  assert.equal(diagnostics.object, "instagram");
  assert.equal(diagnostics.entryCount, 1);
  assert.equal(diagnostics.hasChanges, true);
  assert.equal(diagnostics.changeFields.join(","), "comments");
  assert.deepEqual(diagnostics.valueKeys.sort(), ["from", "id", "text"].sort());
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("secret-user"), false);
  assert.equal(serialized.includes("secret comment"), false);
  assert.equal(serialized.includes("17890000000000001"), false);
});

test("instagram webhook accepts Instagram Login comment shape and enqueues INSTAGRAM_COMMENT", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "89520963556172",
        time: 1_700_000_000,
        changes: [
          {
            field: "comments",
            value: {
              from: { id: "17841400000000111", username: "commenter" },
              id: "17890000000000088",
              text: "สนใจค่ะ",
              media: { id: "17918195224117851", media_product_type: "FEED" }
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_COMMENT");
  assert.equal(repo.lastOutboxPayload?.channelThreadId, "ig:comment:17890000000000088");
  assert.equal(repo.lastIdempotencyKey, "instagram:comment:17890000000000088");
});

test("instagram webhook detects comment-origin event and normalizes INSTAGRAM_COMMENT", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "1137356672785125",
        changes: [
          {
            field: "comments",
            value: {
              from: { id: "17841400000000111" },
              comment_id: "17890000000000001",
              message: "สนใจค่ะ",
              created_time: new Date().toISOString()
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_COMMENT");
  assert.equal(repo.lastOutboxPayload?.channelThreadId, "ig:comment:17890000000000001");
  assert.equal(repo.lastOutboxPayload?.externalMessageId, "17890000000000001");
  assert.equal(repo.lastOutboxPayload?.externalUserId, "17841400000000111");
  assert.equal(repo.lastOutboxPayload?.instagramCommentId, "17890000000000001");
  assert.equal(repo.lastOutboxPayload?.instagramPageId, "1137356672785125");
  assert.equal(repo.lastIdempotencyKey, "instagram:comment:17890000000000001");
});
