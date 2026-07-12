import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createFacebookWebhookPostRoute,
  GET
} from "../../../../app/api/webhook/facebook/route.js";
import {
  computeMetaHubSignature256,
  FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
  type MetaWebhookSignatureDiagnostics,
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

function setFakeMetaAppSecret(): void {
  process.env.FACEBOOK_APP_SECRET = FAKE_META_APP_SECRET;
  delete process.env.META_APP_SECRET;
  delete process.env.INSTAGRAM_APP_SECRET;
}

function makePostReq(
  rawBody: string,
  options?: { signature?: string | null }
): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    "x-tenant-id": TENANT_ID
  });
  if (options?.signature === null) {
    // omit header
  } else if (typeof options?.signature === "string") {
    headers.set("x-hub-signature-256", options.signature);
  } else {
    const digest = computeMetaHubSignature256(FAKE_META_APP_SECRET, rawBody).toString("hex");
    headers.set("x-hub-signature-256", `sha256=${digest}`);
  }
  return new NextRequest("http://local/api/webhook/facebook", {
    method: "POST",
    headers,
    body: rawBody
  });
}

test("GET /api/webhook/facebook hub challenge returns challenge body", async () => {
  process.env.FACEBOOK_VERIFY_TOKEN = "fake-fb-verify-token";
  const req = new NextRequest(
    "http://local/api/webhook/facebook?hub.mode=subscribe&hub.verify_token=fake-fb-verify-token&hub.challenge=route-challenge-1"
  );
  const res = await GET(req);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "route-challenge-1");
});

test("POST /api/webhook/facebook routes tenant by Page ID connection over DEFAULT_TENANT_ID", async () => {
  setFakeMetaAppSecret();
  process.env.DEFAULT_TENANT_ID = TENANT_ID;
  const APP_REVIEW_TENANT = "6797c114-a4fe-4546-a655-8ce2287fedfe";
  const TEST_PAGE = "657955874072241";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "page",
    entry: [
      {
        id: TEST_PAGE,
        messaging: [
          {
            sender: { id: "fb-psid-review" },
            recipient: { id: TEST_PAGE },
            timestamp: 1,
            message: { mid: "fb-mid-review", text: "Hello from app review" }
          }
        ]
      }
    ]
  });
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () =>
      ({
        webhookEventRepository: repo,
        channelConnectionRepository: {
          listByProviderPageId: async () => [
            {
              id: "conn-review",
              tenantId: APP_REVIEW_TENANT,
              provider: "FACEBOOK",
              status: "READY",
              providerPageId: TEST_PAGE,
              providerAccountId: TEST_PAGE,
              providerAccountName: "Connex Business Online",
              providerIgAccountId: null,
              publicConnectionKey: "ccp",
              webhookEndpoint: null,
              webhookActive: true,
              lastInboundVerifiedAt: null,
              lastOutboundVerifiedAt: null,
              lastHealthCheckAt: null,
              lastErrorCode: null,
              lastErrorMessageSafe: null,
              connectedBy: null,
              connectedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ]
        }
      }) as any
  });
  // Meta does not send x-tenant-id — omit it so page routing is exercised.
  const headers = new Headers({
    "content-type": "application/json",
    "x-hub-signature-256": `sha256=${computeMetaHubSignature256(FAKE_META_APP_SECRET, rawBody).toString("hex")}`
  });
  const req = new NextRequest("http://local/api/webhook/facebook", {
    method: "POST",
    headers,
    body: rawBody
  });
  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.tenantId, APP_REVIEW_TENANT);
  assert.equal(repo.lastOutboxPayload?.facebookPageId, TEST_PAGE);
});

test("POST /api/webhook/facebook missing signature returns 401 before enqueue", async () => {
  setFakeMetaAppSecret();
  const repo = new FakeWebhookRepo();
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const rawBody = JSON.stringify({
    object: "page",
    entry: [{ messaging: [{ sender: { id: "fb-psid-1" }, timestamp: 1, message: { mid: "fb-mid-1", text: "hi" } }] }]
  });
  const res = await handler(makePostReq(rawBody, { signature: null }));
  assert.equal(res.status, 401);
  assert.equal(repo.atomicCalls, 0);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, WEBHOOK_SIGNATURE_UNAUTHORIZED);
  assert.equal(JSON.stringify(body).includes(FAKE_META_APP_SECRET), false);
});

test("POST /api/webhook/facebook invalid signature returns 401 before enqueue", async () => {
  setFakeMetaAppSecret();
  const repo = new FakeWebhookRepo();
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const rawBody = JSON.stringify({ object: "page", entry: [{ messaging: [] }] });
  const res = await handler(makePostReq(rawBody, { signature: "sha256=00" }));
  assert.equal(res.status, 401);
  assert.equal(repo.atomicCalls, 0);
  const body = (await res.json()) as { error?: string };
  assert.equal(JSON.stringify(body).includes(FAKE_META_APP_SECRET), false);
});

test("POST /api/webhook/facebook valid page messenger payload enqueues facebook inbound", async () => {
  setFakeMetaAppSecret();
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fake-page-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "page",
    entry: [
      {
        messaging: [
          {
            sender: { id: "fb-psid-route" },
            timestamp: 1_700_000_000_000,
            message: { mid: "fb-mid-route", text: "hello from facebook route" }
          }
        ]
      }
    ]
  });
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const res = await handler(makePostReq(rawBody));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "FACEBOOK");
  const body = (await res.json()) as { ok?: boolean };
  assert.equal(body.ok, true);
  assert.equal(JSON.stringify(body).includes("fake-page-access-token"), false);
});

test("POST /api/webhook/facebook valid page comment payload enqueues facebook comment inbound", async () => {
  setFakeMetaAppSecret();
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "fake-page-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "fake-page-id",
        changes: [
          {
            field: "feed",
            value: {
              from: { id: "fb-psid-comment", name: "Fake Commenter" },
              post_id: "fake-post-id",
              comment_id: "fake-comment-id",
              message: "route comment"
            }
          }
        ]
      }
    ]
  });
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const res = await handler(makePostReq(rawBody));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "FACEBOOK_COMMENT");
});

test("POST /api/webhook/facebook instagram object payload routes to instagram inbound pipeline", async () => {
  setFakeMetaAppSecret();
  process.env.INSTAGRAM_ACCESS_TOKEN = "fake-ig-access-token";
  const repo = new FakeWebhookRepo();
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-route-fb" },
            recipient: { id: "ig-biz-route-fb" },
            timestamp: 1_700_000_000_001,
            message: { mid: "ig-mid-route-fb", text: "hello via facebook route" }
          }
        ]
      }
    ]
  });
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: repo }) as any
  });
  const res = await handler(makePostReq(rawBody));
  assert.equal(res.status, 200);
  assert.equal(repo.atomicCalls, 1);
  assert.equal(repo.lastOutboxPayload?.channel, "INSTAGRAM");
  assert.equal(repo.lastOutboxPayload?.sourceThreadType, "INSTAGRAM_DM");
});

test("POST /api/webhook/facebook logs sanitized signature diagnostics on valid request", async () => {
  setFakeMetaAppSecret();
  process.env.INSTAGRAM_ACCESS_TOKEN = "fake-ig-access-token";
  const rawBody = JSON.stringify({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-diag-fb" },
            recipient: { id: "ig-biz-diag-fb" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-diag-fb", text: "hello diagnostics" }
          }
        ]
      }
    ]
  });
  const logs: Array<{ diagnostics: MetaWebhookSignatureDiagnostics; passed: boolean }> = [];
  const handler = createFacebookWebhookPostRoute({
    apiBootstrapImpl: () => ({ webhookEventRepository: new FakeWebhookRepo() }) as any,
    logSignatureDiagnostics: (diagnostics, passed) => {
      logs.push({ diagnostics, passed });
    }
  });
  const headers = new Headers({
    "content-type": "application/json",
    "x-tenant-id": TENANT_ID,
    "user-agent": "facebookexternalua/1.1"
  });
  const digest = computeMetaHubSignature256(FAKE_META_APP_SECRET, rawBody).toString("hex");
  headers.set("x-hub-signature-256", `sha256=${digest}`);
  const req = new NextRequest("http://local/api/webhook/facebook", {
    method: "POST",
    headers,
    body: rawBody
  });
  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.passed, true);
  assert.equal(logs[0]?.diagnostics.route, FACEBOOK_WEBHOOK_SIGNATURE_ROUTE);
  assert.equal(logs[0]?.diagnostics.verifiedAlgorithm, "sha256");
  assert.equal(logs[0]?.diagnostics.matchedSecretSource, "FACEBOOK_APP_SECRET");
  assert.equal(logs[0]?.diagnostics.sha256SignatureMatches, true);
  assert.equal(logs[0]?.diagnostics.isFacebookExternalUa, true);
  assert.equal(logs[0]?.diagnostics.failureReason, undefined);
  const serialized = JSON.stringify(logs[0]?.diagnostics);
  assert.equal(serialized.includes(FAKE_META_APP_SECRET), false);
  assert.equal(serialized.includes(rawBody), false);
  assert.equal(serialized.includes(`sha256=${digest}`), false);
  assert.equal(serialized.includes("facebookexternalua/1.1"), false);
});

test("POST /api/webhook/facebook maintenance gate ON returns 503 before signature and handler", async () => {
  const previous = process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
  process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = "true";
  try {
    setFakeMetaAppSecret();
    const repo = new FakeWebhookRepo();
    let handlerCalled = false;
    const handler = createFacebookWebhookPostRoute({
      apiBootstrapImpl: () => {
        handlerCalled = true;
        return { webhookEventRepository: repo } as any;
      }
    });
    const rawBody = JSON.stringify({
      object: "page",
      entry: [{ messaging: [{ sender: { id: "fb-psid-1" }, timestamp: 1, message: { mid: "fb-mid-1", text: "hi" } }] }]
    });
    const res = await handler(makePostReq(rawBody));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Retry-After"), "60");
    const body = (await res.json()) as { code?: string; error?: string };
    assert.equal(body.code, "CHAT_INGRESS_MAINTENANCE");
    assert.equal(handlerCalled, false);
    assert.equal(repo.atomicCalls, 0);
    assert.equal(JSON.stringify(body).includes(rawBody), false);
  } finally {
    if (previous === undefined) delete process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
    else process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = previous;
  }
});

test("GET /api/webhook/facebook verification remains available when maintenance gate ON", async () => {
  const previous = process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
  process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = "true";
  try {
    process.env.FACEBOOK_VERIFY_TOKEN = "fake-fb-verify-token";
    const req = new NextRequest(
      "http://local/api/webhook/facebook?hub.mode=subscribe&hub.verify_token=fake-fb-verify-token&hub.challenge=route-challenge-maint"
    );
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "route-challenge-maint");
  } finally {
    if (previous === undefined) delete process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED;
    else process.env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED = previous;
  }
});
