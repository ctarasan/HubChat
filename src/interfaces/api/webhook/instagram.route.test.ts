import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createInstagramWebhookPostRoute } from "../../../../app/api/webhook/instagram/route.js";
import {
  computeMetaHubSignature256,
  computeMetaHubSignatureSha1,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";
import type { WebhookEventRepository } from "../../../domain/ports.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const FAKE_META_APP_SECRET = "fake-meta-app-secret-for-tests";

class FakeWebhookRepo implements WebhookEventRepository {
  public atomicCalls = 0;
  public lastOutboxPayload: Record<string, unknown> | null = null;
  async saveIfNotExists(): Promise<"inserted" | "duplicate"> {
    return "inserted";
  }
  async saveInboundAndOutboxIfNotExists(input: {
    outboxPayload: Record<string, unknown>;
  }): Promise<"inserted" | "duplicate"> {
    this.atomicCalls += 1;
    this.lastOutboxPayload = input.outboxPayload;
    return "inserted";
  }
}

function makeReq(
  rawBody: string,
  options?: {
    appSecret?: string;
    signature?: string | null;
    signatureScheme?: "sha256" | "sha1" | "none";
  }
): NextRequest {
  const appSecret = options?.appSecret ?? process.env.FACEBOOK_APP_SECRET ?? FAKE_META_APP_SECRET;
  const headers = new Headers({
    "content-type": "application/json",
    "x-tenant-id": TENANT_ID
  });
  const scheme = options?.signatureScheme ?? "sha256";
  if (options?.signature === null || scheme === "none") {
    // omit signature headers
  } else if (typeof options?.signature === "string") {
    if (scheme === "sha1") {
      headers.set("x-hub-signature", options.signature);
    } else {
      headers.set("x-hub-signature-256", options.signature);
    }
  } else if (scheme === "sha1") {
    const digest = computeMetaHubSignatureSha1(appSecret, rawBody).toString("hex");
    headers.set("x-hub-signature", `sha1=${digest}`);
  } else {
    const digest = computeMetaHubSignature256(appSecret, rawBody).toString("hex");
    headers.set("x-hub-signature-256", `sha256=${digest}`);
  }
  return new NextRequest("http://local/api/webhook/instagram", {
    method: "POST",
    headers,
    body: rawBody
  });
}

function setFacebookAppSecret(secret: string = FAKE_META_APP_SECRET): void {
  process.env.FACEBOOK_APP_SECRET = secret;
  delete process.env.META_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
}

test("POST /api/webhook/instagram missing signature returns 401 before enqueue", async () => {
  setFacebookAppSecret();
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [{ messaging: [{ sender: { id: "ig-user-1" }, message: { mid: "ig-mid-1", text: "hi" } }] }]
  });
  const res = await handler(makeReq(rawBody, { signature: null }));
  assert.equal(res.status, 401);
  assert.equal(repo.atomicCalls, 0);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(JSON.stringify(body).includes(FAKE_META_APP_SECRET), false);
});

test("POST /api/webhook/instagram invalid signature returns 401 before enqueue", async () => {
  setFacebookAppSecret();
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const rawBody = JSON.stringify({ object: "instagram", entry: [{ messaging: [] }] });
  const res = await handler(makeReq(rawBody, { signature: "sha256=00" }));
  assert.equal(res.status, 401);
  assert.equal(repo.atomicCalls, 0);
  const body = (await res.json()) as { error?: string };
  assert.equal(JSON.stringify(body).includes(FAKE_META_APP_SECRET), false);
});

test("POST /api/webhook/instagram malformed signature header returns 401 before enqueue", async () => {
  setFacebookAppSecret();
  const repo = new FakeWebhookRepo();
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const rawBody = JSON.stringify({ object: "instagram", entry: [{ messaging: [] }] });
  const res = await handler(makeReq(rawBody, { signature: "not-sha256-format" }));
  assert.equal(res.status, 401);
  assert.equal(repo.atomicCalls, 0);
});

test("POST /api/webhook/instagram valid sha256 signature enqueues instagram dm via instagram handler path", async () => {
  setFacebookAppSecret();
  process.env.INSTAGRAM_ACCESS_TOKEN = "fake-ig-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-route" },
            recipient: { id: "ig-biz-route" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-route", text: "hello via instagram url" }
          }
        ]
      }
    ]
  });

  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });

  const res = await handler(makeReq(rawBody));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_DM");
  const body = (await res.json()) as { ok?: boolean };
  assert.equal(body.ok, true);
  assert.equal(JSON.stringify(body).includes("fake-ig-access-token"), false);
});

test("POST /api/webhook/instagram valid legacy sha1 signature enqueues instagram inbound", async () => {
  setFacebookAppSecret();
  process.env.INSTAGRAM_ACCESS_TOKEN = "fake-ig-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-sha1" },
            recipient: { id: "ig-biz-sha1" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-sha1", text: "hello via sha1 signature" }
          }
        ]
      }
    ]
  });

  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });

  const res = await handler(makeReq(rawBody, { signatureScheme: "sha1" }));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
});

test("POST /api/webhook/instagram valid sha256 signature enqueues instagram comment inbound", async () => {
  setFacebookAppSecret();
  process.env.INSTAGRAM_ACCESS_TOKEN = "fake-ig-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
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
  });

  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });

  const res = await handler(makeReq(rawBody));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_COMMENT");
  assert.equal(repo.lastOutboxPayload?.channelThreadId, "ig:comment:17890000000000001");
});

test("POST /api/webhook/instagram valid signature with invalid JSON returns 400 after signature passes", async () => {
  setFacebookAppSecret();
  const rawBody = "{not valid json";
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: new FakeWebhookRepo() }) as any
  });
  const res = await handler(makeReq(rawBody));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "Invalid webhook payload");
  assert.equal(JSON.stringify(body).includes("{not valid json"), false);
});
