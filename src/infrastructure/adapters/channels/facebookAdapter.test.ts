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

test("Facebook adapter maps Messenger DOCUMENT_PDF outbound payload", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.file" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      channelThreadId: "user:12345",
      content: "",
      idempotencyKey: "idemp",
      messageType: "DOCUMENT_PDF",
      mediaUrl: "https://example.com/manual.pdf",
      mediaMimeType: "application/pdf",
      fileName: "manual.pdf"
    });
    assert.equal(requestBody.message.attachment.type, "file");
    assert.equal(requestBody.message.attachment.payload.url, "https://example.com/manual.pdf");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook inbound messaging includes display name when profile lookup succeeds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, _init?: any) => {
    if (String(url).includes("fields=name")) {
      return new Response(JSON.stringify({ name: "FB User" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
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
    });
    assert.equal(normalized.profile?.name, "FB User");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook inbound continues when profile lookup fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("graph unavailable");
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
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
    });
    assert.equal(normalized.externalMessageId, "mid-2");
    assert.equal(normalized.profile?.name, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
