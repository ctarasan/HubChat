import test from "node:test";
import assert from "node:assert/strict";
import { FacebookAdapter } from "./facebookAdapter.js";

test("Facebook adapter maps Messenger IMAGE outbound payload", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      channelThreadId: "user:12345",
      content: "",
      idempotencyKey: "idemp",
      messageType: "IMAGE",
      mediaUrl: "https://example.com/img.png",
      mediaMimeType: "image/png"
    });
    assert.equal(requestBody.message.attachment.type, "image");
    assert.equal(requestBody.message.attachment.payload.url, "https://example.com/img.png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter rejects IMAGE for comment mode", async () => {
  const adapter = new FacebookAdapter({ pageAccessToken: "token" });
  await assert.rejects(
    adapter.sendMessage({
      channelThreadId: "comment:123",
      content: "",
      idempotencyKey: "idemp",
      messageType: "IMAGE",
      mediaUrl: "https://example.com/img.png",
      mediaMimeType: "image/png"
    }),
    /Messenger DM only/
  );
});

test("Facebook text flow still works unchanged", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.text" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      channelThreadId: "user:12345",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(requestBody.message.text, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
