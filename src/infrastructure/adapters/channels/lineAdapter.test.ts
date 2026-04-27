import test from "node:test";
import assert from "node:assert/strict";
import { LineAdapter } from "./lineAdapter.js";

test("LINE uses previewUrl when available", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    await adapter.sendMessage({
      channelThreadId: "U123",
      content: "",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      messageType: "IMAGE",
      mediaUrl: "https://example.com/image.jpg",
      previewUrl: "https://example.com/preview.jpg",
      mediaMimeType: "image/jpeg"
    });
    assert.equal(requestBody.messages[0].type, "image");
    assert.equal(requestBody.messages[0].originalContentUrl, "https://example.com/image.jpg");
    assert.equal(requestBody.messages[0].previewImageUrl, "https://example.com/preview.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE falls back previewImageUrl to mediaUrl for old records", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    await adapter.sendMessage({
      channelThreadId: "U123",
      content: "",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      messageType: "IMAGE",
      mediaUrl: "https://example.com/image.jpg",
      mediaMimeType: "image/jpeg"
    });
    assert.equal(requestBody.messages[0].previewImageUrl, "https://example.com/image.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE image rejects non-HTTPS URL", async () => {
  const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
  await assert.rejects(
    adapter.sendMessage({
      channelThreadId: "U123",
      content: "",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      messageType: "IMAGE",
      mediaUrl: "http://example.com/image.jpg",
      mediaMimeType: "image/jpeg"
    }),
    /must be HTTPS/
  );
});

test("LINE text flow still works unchanged", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    await adapter.sendMessage({
      channelThreadId: "U123",
      content: "hello",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000"
    });
    assert.equal(requestBody.messages[0].type, "text");
    assert.equal(requestBody.messages[0].text, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE inbound includes display name when profile lookup succeeds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => {
    return new Response(JSON.stringify({ displayName: "Line Customer" }), { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    const normalized = await adapter.receiveMessage({
      events: [
        {
          timestamp: Date.now(),
          source: { userId: "U1234" },
          message: { id: "m-1", type: "text", text: "hello" }
        }
      ]
    });
    assert.equal(normalized.profile?.name, "Line Customer");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE inbound stores profile image when pictureUrl is available", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => {
    return new Response(
      JSON.stringify({
        displayName: "Line Customer",
        pictureUrl: "https://profile.line-scdn.net/0hABCDEF"
      }),
      { status: 200 }
    );
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    const normalized = await adapter.receiveMessage({
      events: [
        {
          timestamp: Date.now(),
          source: { userId: "U1234" },
          message: { id: "m-pic", type: "text", text: "hello" }
        }
      ]
    });
    assert.equal(normalized.profile?.profileImageUrl, "https://profile.line-scdn.net/0hABCDEF");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE inbound continues when profile lookup fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    const normalized = await adapter.receiveMessage({
      events: [
        {
          timestamp: Date.now(),
          source: { userId: "U1234" },
          message: { id: "m-2", type: "text", text: "hello" }
        }
      ]
    });
    assert.equal(normalized.externalMessageId, "m-2");
    assert.equal(normalized.profile?.name, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE PDF uses explicit text link fallback", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    await adapter.sendMessage({
      channelThreadId: "U123",
      content: "",
      idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
      messageType: "DOCUMENT_PDF",
      mediaUrl: "https://example.com/file.pdf",
      mediaMimeType: "application/pdf",
      fileName: "manual.pdf"
    });
    assert.equal(requestBody.messages[0].type, "text");
    assert.equal(String(requestBody.messages[0].text).includes("manual.pdf"), true);
    assert.equal(String(requestBody.messages[0].text).includes("https://example.com/file.pdf"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE inbound image maps message type and line message id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => {
    return new Response(JSON.stringify({ displayName: "Line Customer" }), { status: 200 });
  }) as any;
  try {
    const adapter = new LineAdapter({ channelAccessToken: "token", channelSecret: "secret" });
    const normalized = await adapter.receiveMessage({
      events: [
        {
          timestamp: Date.now(),
          source: { userId: "U1234" },
          message: { id: "m-image-1", type: "image" }
        }
      ]
    });
    assert.equal(normalized.messageType, "IMAGE");
    assert.equal(normalized.lineMessageId, "m-image-1");
    assert.equal(normalized.text, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
