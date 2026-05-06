import test from "node:test";
import assert from "node:assert/strict";
import { InstagramAdapter } from "./instagramAdapter.js";

test("Instagram inbound text DM normalization works", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  const normalized = await adapter.receiveMessage({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            recipient: { id: "ig-page-1" },
            timestamp: Date.now(),
            message: { mid: "ig-mid-1", text: "hello instagram" }
          }
        ]
      }
    ]
  });
  assert.equal(normalized.externalUserId, "ig-user-1");
  assert.equal(normalized.channelThreadId, "ig:user:ig-user-1");
  assert.equal(normalized.messageType, "TEXT");
  assert.equal(normalized.text, "hello instagram");
});

test("Instagram inbound change payload normalization works", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  const normalized = await adapter.receiveMessage({
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
  });
  assert.equal(normalized.externalUserId, "ig-user-2");
  assert.equal(normalized.channelThreadId, "ig:user:ig-user-2");
  assert.equal(normalized.text, "hello from changes");
  assert.equal(normalized.metadataJson?.instagramRecipientId, "ig-biz-2");
});

test("Instagram inbound timestamp in seconds is parsed correctly", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  const normalized = await adapter.receiveMessage({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            timestamp: 1715000000,
            message: { mid: "ig-mid-seconds", text: "seconds ts" }
          }
        ]
      }
    ]
  });
  const occurredAtMs = new Date(normalized.occurredAt).getTime();
  assert.equal(Number.isNaN(occurredAtMs), false);
  assert.equal(new Date(normalized.occurredAt).getUTCFullYear() >= 2024, true);
});

test("Instagram inbound timestamp in milliseconds is parsed correctly", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  const normalized = await adapter.receiveMessage({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            timestamp: 1715000000000,
            message: { mid: "ig-mid-millis", text: "millis ts" }
          }
        ]
      }
    ]
  });
  const occurredAtMs = new Date(normalized.occurredAt).getTime();
  assert.equal(Number.isNaN(occurredAtMs), false);
  assert.equal(new Date(normalized.occurredAt).getUTCFullYear() >= 2024, true);
});

test("Instagram inbound invalid timestamp falls back safely", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  const before = Date.now();
  const normalized = await adapter.receiveMessage({
    object: "instagram",
    entry: [
      {
        messaging: [
          {
            sender: { id: "ig-user-1" },
            timestamp: "not-a-timestamp",
            message: { mid: "ig-mid-invalid", text: "invalid ts" }
          }
        ]
      }
    ]
  });
  const after = Date.now();
  const occurredAtMs = new Date(normalized.occurredAt).getTime();
  assert.equal(Number.isNaN(occurredAtMs), false);
  assert.equal(occurredAtMs >= before - 5000, true);
  assert.equal(occurredAtMs <= after + 5000, true);
});

test("Instagram inbound media-only event is rejected as unsupported in phase 1", async () => {
  const adapter = new InstagramAdapter({ accessToken: "token" });
  await assert.rejects(
    adapter.receiveMessage({
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
    }),
    /Instagram inbound media is not supported in this phase/
  );
});

test("Instagram outbound text send works", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "ig-sent-1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({ accessToken: "token", graphVersion: "v25.0" });
    const sent = await adapter.sendMessage({
      channelThreadId: "ig:user:17841400000000000",
      content: "reply text",
      idempotencyKey: "idemp-ig-1",
      messageType: "TEXT"
    });
    assert.equal(requestBody.recipient.id, "17841400000000000");
    assert.equal(requestBody.message.text, "reply text");
    assert.equal(sent.externalMessageId, "ig-sent-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
