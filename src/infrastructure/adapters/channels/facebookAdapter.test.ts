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
    /text only/
  );
});

test("Facebook adapter sends private reply using comment_id recipient", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.private" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendPrivateReply?.({
      pageId: "123456",
      commentId: "123_456",
      content: "hi privately",
      idempotencyKey: "idemp"
    });
    assert.equal(requestBody.recipient.comment_id, "123_456");
    assert.equal(requestBody.message.text, "hi privately");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter sends public comment reply under original comment", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "comment-reply-1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendPublicCommentReply?.({
      pageId: "123456",
      commentId: "123_456",
      text: "ขออนุญาตตอบกลับทาง Inbox นะครับ"
    });
    assert.equal(requestBody.message, "ขออนุญาตตอบกลับทาง Inbox นะครับ");
    assert.equal(requestBody.access_token, "token");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    if (String(url).includes("fields=name") && String(url).includes("profile_pic")) {
      return new Response(
        JSON.stringify({ name: "FB User", profile_pic: "https://platform-lookaside.fbsbx.com/pic.jpg" }),
        { status: 200 }
      );
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
    assert.equal(normalized.profile?.profileImageUrl, "https://platform-lookaside.fbsbx.com/pic.jpg");
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
