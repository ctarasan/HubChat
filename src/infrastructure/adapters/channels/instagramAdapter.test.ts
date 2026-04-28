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
  assert.equal(normalized.channelThreadId, "ig-user-1");
  assert.equal(normalized.messageType, "TEXT");
  assert.equal(normalized.text, "hello instagram");
});

test("Instagram outbound text send works", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "ig-sent-1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({ accessToken: "token", accountId: "17841400000000000" });
    const sent = await adapter.sendMessage({
      channelThreadId: "ig-user-1",
      content: "reply text",
      idempotencyKey: "idemp-ig-1",
      messageType: "TEXT"
    });
    assert.equal(requestBody.recipient.id, "ig-user-1");
    assert.equal(requestBody.message.text, "reply text");
    assert.equal(sent.externalMessageId, "ig-sent-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
