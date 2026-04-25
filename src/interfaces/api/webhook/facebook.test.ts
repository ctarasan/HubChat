import test from "node:test";
import assert from "node:assert/strict";
import { createFacebookWebhookHandler } from "./facebook.js";
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

test("facebook webhook includes sender display name payload", async () => {
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

test("facebook comment webhook marks comment origin fields", async () => {
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
});
