import test from "node:test";
import assert from "node:assert/strict";
import { createFacebookWebhookHandler, verifyFacebookWebhook } from "./facebook.js";
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
  const appSecret = options?.appSecret ?? process.env.FACEBOOK_APP_SECRET ?? "meta-app-secret";
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
  process.env.FACEBOOK_APP_SECRET = secret;
  delete process.env.META_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
}

const res = {
  json: (body: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(body), { status: init?.status ?? 200 })
};

test("facebook webhook GET challenge still works", () => {
  process.env.FACEBOOK_VERIFY_TOKEN = "fb-verify";
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "fb-verify",
    "hub.challenge": "challenge-456"
  });
  const result = verifyFacebookWebhook(params);
  assert.equal(result.ok, true);
  assert.equal(result.body, "challenge-456");
  assert.equal(result.status, 200);
});

test("facebook webhook rejects missing meta signature", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createFacebookWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "page",
    entry: [{ messaging: [{ sender: { id: "1" }, timestamp: 1, message: { mid: "m", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { signature: null }), res);
  assert.equal(response.status, 401);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(JSON.stringify(body).includes("meta-app-secret"), false);
});

test("facebook webhook rejects invalid meta signature", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createFacebookWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "page",
    entry: [{ messaging: [{ sender: { id: "1" }, timestamp: 1, message: { mid: "m2", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { signature: "sha256=deadbeef" }), res);
  assert.equal(response.status, 401);
});

test("facebook webhook rejects malformed meta signature header", async () => {
  setMetaAppSecret("meta-app-secret");
  const handler = createFacebookWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = { object: "page", entry: [{ messaging: [] }] };
  const response = await handler(makeReq(payload, { signature: "not-sha256-format" }), res);
  assert.equal(response.status, 401);
});

test("facebook webhook rejects when meta app secret is missing", async () => {
  delete process.env.META_APP_SECRET;
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
  const handler = createFacebookWebhookHandler({ webhookRepository: new FakeWebhookRepo() });
  const payload = {
    object: "page",
    entry: [{ messaging: [{ sender: { id: "1" }, timestamp: 1, message: { mid: "m3", text: "hi" } }] }]
  };
  const response = await handler(makeReq(payload, { appSecret: "" }), res);
  assert.equal(response.status, 401);
  const body = JSON.parse(await response.text()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_MISCONFIGURED);
});

test("facebook webhook includes sender display name payload", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("fields=name") && String(url).includes("profile_pic")) {
      return new Response(
        JSON.stringify({
          name: "Facebook Name",
          profile_pic: "https://platform-lookaside.fbsbx.com/a.jpg"
        }),
        { status: 200 }
      );
    }
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const repo = new FakeWebhookRepo();
    const handler = createFacebookWebhookHandler({ webhookRepository: repo });
    const payload = {
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "12345" },
              timestamp: Date.now(),
              message: { mid: "mid-1", text: "hello" }
            }
          ]
        }
      ]
    };
    const response = await handler(makeReq(payload), res);
    assert.equal(response.status, 200);
    assert.equal(repo.lastOutboxPayload?.senderDisplayName, "Facebook Name");
    assert.equal(repo.lastOutboxPayload?.senderProfileImageUrl, "https://platform-lookaside.fbsbx.com/a.jpg");
    assert.equal(repo.atomicCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("facebook webhook continues when profile lookup fails", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("graph down");
  }) as any;
  try {
    const repo = new FakeWebhookRepo();
    const handler = createFacebookWebhookHandler({ webhookRepository: repo });
    const payload = {
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "12345" },
              timestamp: Date.now(),
              message: { mid: "mid-2", text: "hello" }
            }
          ]
        }
      ]
    };
    const response = await handler(makeReq(payload), res);
    assert.equal(response.status, 200);
    assert.equal(repo.atomicCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("facebook reaction webhook is ignored without outbox enqueue", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "token";
  const repo = new FakeWebhookRepo();
  const handler = createFacebookWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "page",
    entry: [
      {
        id: "page_1",
        changes: [
          {
            field: "feed",
            value: {
              item: "reaction",
              verb: "add",
              from: { id: "psid_1", name: "Reactor" },
              post_id: "post_1",
              message: "Parent post marketing copy"
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text()) as { ok?: boolean; ignored?: string };
  assert.equal(body.ok, true);
  assert.equal(body.ignored, "reaction_event");
  assert.equal(repo.atomicCalls, 0);
  assert.equal(repo.lastOutboxPayload, null);
});

test("facebook comment webhook marks comment origin fields", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "token";
  const repo = new FakeWebhookRepo();
  const handler = createFacebookWebhookHandler({ webhookRepository: repo });
  const payload = {
    object: "page",
    entry: [
      {
        id: "page_1",
        changes: [
          {
            field: "feed",
            value: {
              from: { id: "psid_1", name: "Commenter" },
              post_id: "post_1",
              comment_id: "post_1_2",
              message: "Interested"
            }
          }
        ]
      }
    ]
  };
  const response = await handler(makeReq(payload), res);
  assert.equal(response.status, 200);
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "FACEBOOK_COMMENT");
  assert.equal(repo.lastOutboxPayload?.facebookPageId, "page_1");
  assert.equal(repo.lastOutboxPayload?.facebookPostId, "post_1");
  assert.equal(repo.lastOutboxPayload?.facebookCommentId, "post_1_2");
  assert.deepEqual(repo.lastOutboxPayload?.metadataJson, {});
});

test("facebook webhook forwards instagram object payload to instagram inbound pipeline", async () => {
  setMetaAppSecret("meta-app-secret");
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("/ig-user-meta") && String(url).includes("fields=name")) {
      return new Response(JSON.stringify({ name: "Insta Tester" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const repo = new FakeWebhookRepo();
    const handler = createFacebookWebhookHandler({ webhookRepository: repo });
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "igid-1",
          messaging: [
            {
              sender: { id: "ig-user-meta" },
              recipient: { id: "igid-1" },
              timestamp: Date.now(),
              message: { mid: "ig-meta-mid", text: "hello via facebook url" }
            }
          ]
        }
      ]
    };
    const response = await handler(makeReq(payload), res);
    assert.equal(response.status, 200);
    assert.equal(repo.atomicCalls, 1);
    assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
    assert.equal(repo.lastOutboxPayload?.externalUserId, "ig-user-meta");
    assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_DM");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
