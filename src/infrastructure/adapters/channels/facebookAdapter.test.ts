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
    assert.equal(requestBody.recipient.id, "12345");
    assert.equal(requestBody.message.attachment.type, "image");
    assert.equal(requestBody.message.attachment.payload.url, "https://example.com/img.png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter accepts raw PSID for Messenger Send API", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.raw-psid" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      channelThreadId: "12345",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(requestBody.recipient.id, "12345");
    assert.equal(requestBody.message.text, "hello");
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
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    requestUrl = String(url);
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
    assert.equal(requestUrl.includes("/me/messages"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Private Reply API never uses object id me as target", async () => {
  const adapter = new FacebookAdapter({ pageAccessToken: "token" });
  await assert.rejects(
    adapter.sendPrivateReply?.({
      pageId: null,
      commentId: "123_456",
      content: "hello",
      idempotencyKey: "idemp"
    }) as Promise<{ externalMessageId: string }>,
    /missing Facebook page ID/
  );
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

test("public acknowledgement uses replyToFacebookComment API", async () => {
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init?: any) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "comment-reply-2" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.replyToFacebookComment?.({
      commentId: "123_789",
      text: "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ"
    });
    assert.equal(requestBody.message, "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ");
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

test("Facebook inbound image uses payload CDN URL without storage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
      entry: [
        {
          messaging: [
            {
              sender: { id: "12345" },
              timestamp: Date.now(),
              message: {
                mid: "mid-img-1",
                attachments: [{ type: "image", payload: { url: "https://cdn.facebook.com/image.jpg" } }]
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.messageType, "IMAGE");
    assert.equal(normalized.mediaUrl, "https://cdn.facebook.com/image.jpg");
    assert.equal(normalized.previewUrl, "https://cdn.facebook.com/image.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook inbound comment normalizes epoch seconds timestamp", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
      entry: [
        {
          id: "1137356672785125",
          changes: [
            {
              field: "feed",
              value: {
                from: { id: "27244508575134096", name: "Chamnan Tarasansombat" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1379551257551517",
                message: "ทักทายทาง Post ใหม่นะ 29/4/2569",
                time: 1745900692
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.sourceThreadType, "FACEBOOK_COMMENT");
    assert.equal(normalized.occurredAt, "2025-04-29T04:24:52.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment attachment maps to IMAGE with thumbnail/full URLs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
      entry: [
        {
          id: "1137356672785125",
          changes: [
            {
              field: "feed",
              value: {
                from: { id: "27244508575134096", name: "Chamnan Tarasansombat" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169787",
                attachment: {
                  type: "photo",
                  media: { image: { src: "https://cdn.facebook.com/comment-thumb.jpg" } }
                },
                permalink_url: "https://www.facebook.com/permalink.php?story_fbid=1&id=1",
                message: "",
                time: 1777441627
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.messageType, "IMAGE");
    assert.equal(normalized.text, "");
    assert.equal(normalized.mediaUrl, "https://cdn.facebook.com/comment-thumb.jpg");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.thumbnailUrl, "https://cdn.facebook.com/comment-thumb.jpg");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.fullImageUrl, "https://cdn.facebook.com/comment-thumb.jpg");
    assert.equal(
      (normalized.metadataJson as Record<string, unknown>)?.permalinkUrl,
      "https://www.facebook.com/permalink.php?story_fbid=1&id=1"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment without webhook attachment pulls image from Graph detail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("fields=id,message,created_time,from,attachment,permalink_url")) {
      return new Response(
        JSON.stringify({
          id: "122105157068693891_1426457839169788",
          message: "",
          permalink_url: "https://www.facebook.com/permalink.php?story_fbid=2&id=2",
          attachment: {
            type: "photo",
            media: { image: { src: "https://cdn.facebook.com/from-graph-thumb.jpg" }, source: "https://cdn.facebook.com/from-graph-full.jpg" }
          }
        }),
        { status: 200 }
      );
    }
    if (String(url).includes("fields=message")) {
      return new Response(JSON.stringify({ message: "" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const normalized = await adapter.receiveMessage({
      entry: [
        {
          id: "1137356672785125",
          changes: [
            {
              field: "feed",
              value: {
                from: { id: "27244508575134096", name: "Chamnan Tarasansombat" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169788",
                message: "",
                time: 1777441628
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.messageType, "IMAGE");
    assert.equal(normalized.text, "");
    assert.equal(normalized.mediaUrl, "https://cdn.facebook.com/from-graph-full.jpg");
    assert.equal(normalized.previewUrl, "https://cdn.facebook.com/from-graph-thumb.jpg");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.thumbnailUrl, "https://cdn.facebook.com/from-graph-thumb.jpg");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.fullImageUrl, "https://cdn.facebook.com/from-graph-full.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
