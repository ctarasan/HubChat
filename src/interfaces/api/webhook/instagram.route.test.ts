import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createInstagramWebhookPostRoute } from "../../../../app/api/webhook/instagram/route.js";
import {
  computeMetaHubSignature256,
  WEBHOOK_SIGNATURE_UNAUTHORIZED
} from "./webhookSignature.js";
import type { WebhookEventRepository } from "../../../domain/ports.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

class FakeWebhookRepo implements WebhookEventRepository {
  public atomicCalls = 0;
  async saveIfNotExists(): Promise<"inserted" | "duplicate"> {
    return "inserted";
  }
  async saveInboundAndOutboxIfNotExists(): Promise<"inserted" | "duplicate"> {
    this.atomicCalls += 1;
    return "inserted";
  }
}

function makeReq(
  rawBody: string,
  options?: { appSecret?: string; signature?: string | null }
): NextRequest {
  const appSecret = options?.appSecret ?? process.env.FACEBOOK_APP_SECRET ?? "meta-app-secret";
  const headers = new Headers({
    "content-type": "application/json",
    "x-tenant-id": TENANT_ID
  });
  if (options?.signature === null) {
    // omit header
  } else if (typeof options?.signature === "string") {
    headers.set("x-hub-signature-256", options.signature);
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

function setFacebookAppSecret(secret: string): void {
  process.env.FACEBOOK_APP_SECRET = secret;
  delete process.env.META_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
}

test("POST /api/webhook/instagram missing signature returns 401", async () => {
  setFacebookAppSecret("meta-app-secret");
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [{ messaging: [{ sender: { id: "ig-user-1" }, message: { mid: "ig-mid-1", text: "hi" } }] }]
  });
  const res = await handler(makeReq(rawBody, { signature: null }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(JSON.stringify(body).includes("meta-app-secret"), false);
});

test("POST /api/webhook/instagram invalid signature returns 401", async () => {
  setFacebookAppSecret("meta-app-secret");
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const rawBody = JSON.stringify({ object: "instagram", entry: [{ messaging: [] }] });
  const res = await handler(makeReq(rawBody, { signature: "sha256=00" }));
  assert.equal(res.status, 401);
});

test("POST /api/webhook/instagram malformed signature header returns 401", async () => {
  setFacebookAppSecret("meta-app-secret");
  const handler = createInstagramWebhookPostRoute({
    apiBootstrapImpl: () => {
      throw new Error("should not bootstrap");
    }
  });
  const rawBody = JSON.stringify({ object: "instagram", entry: [{ messaging: [] }] });
  const res = await handler(makeReq(rawBody, { signature: "not-sha256-format" }));
  assert.equal(res.status, 401);
});

test("POST /api/webhook/instagram valid FACEBOOK_APP_SECRET signature enqueues instagram via facebook handler path", async () => {
  setFacebookAppSecret("meta-app-secret");
  process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
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
  const body = (await res.json()) as { ok?: boolean };
  assert.equal(body.ok, true);
  assert.equal(JSON.stringify(body).includes("ig-token"), false);
});

test("POST /api/webhook/instagram valid signature with invalid JSON returns 400 after signature passes", async () => {
  setFacebookAppSecret("meta-app-secret");
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
