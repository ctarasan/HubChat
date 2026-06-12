import test from "node:test";
import assert from "node:assert/strict";
import { FacebookAdapter } from "./facebookAdapter.js";

test("Facebook adapter maps Messenger IMAGE outbound payload", async () => {
  let requestBody: any = null;
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      pageId: "1137356672785125",
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
    assert.equal(requestUrl.includes("/v25.0/me/messages"), true);
    assert.equal(requestUrl.includes("/v25.0/1137356672785125/messages"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter normalizes graph version from numeric env value", async () => {
  let requestUrl = "";
  const originalEnv = process.env.FACEBOOK_GRAPH_VERSION;
  const originalFetch = globalThis.fetch;
  process.env.FACEBOOK_GRAPH_VERSION = "25.0";
  globalThis.fetch = (async (url: any) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({ message_id: "mid.env-number" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      pageId: "1137356672785125",
      channelThreadId: "user:12345",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(requestUrl.includes("/v25.0/me/messages"), true);
    assert.equal(requestUrl.includes("/v25.0/1137356672785125/messages"), false);
  } finally {
    process.env.FACEBOOK_GRAPH_VERSION = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter keeps prefixed graph version from env", async () => {
  let requestUrl = "";
  const originalEnv = process.env.FACEBOOK_GRAPH_VERSION;
  const originalFetch = globalThis.fetch;
  process.env.FACEBOOK_GRAPH_VERSION = "v25.0";
  globalThis.fetch = (async (url: any) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({ message_id: "mid.env-prefixed" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      pageId: "1137356672785125",
      channelThreadId: "user:12345",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(requestUrl.includes("/v25.0/me/messages"), true);
    assert.equal(requestUrl.includes("/v25.0/1137356672785125/messages"), false);
  } finally {
    process.env.FACEBOOK_GRAPH_VERSION = originalEnv;
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
      pageId: "1137356672785125",
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

test("Facebook adapter prefers providerExternalUserId over channel_thread_id for recipient", async () => {
  let requestBody: any = null;
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "mid.psid-pref" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await adapter.sendMessage({
      pageId: "541846535668129",
      channelThreadId: "user:00000000000000000",
      providerExternalUserId: "12345678901234567",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(requestBody.recipient.id, "12345678901234567");
    assert.equal(requestUrl.includes("/me/messages"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter rejects comment target for sendMessage before Meta call", async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ message_id: "should-not-happen" }), { status: 200 });
  }) as any;
  const adapter = new FacebookAdapter({ pageAccessToken: "token" });
  try {
    (adapter as any).sendPrivateReply = async () => {
      throw new Error("sendPrivateReply must not be called by sendMessage");
    };
    await assert.rejects(
      adapter.sendMessage({
        pageId: "1137356672785125",
        channelThreadId: "comment:123_456",
        content: "hello",
        idempotencyKey: "idemp"
      }),
      /Invalid Facebook Messenger send target/
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook adapter rejects raw Facebook comment object id for sendMessage", async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ message_id: "should-not-happen" }), { status: 200 });
  }) as any;
  const adapter = new FacebookAdapter({ pageAccessToken: "token" });
  try {
    await assert.rejects(
      adapter.sendMessage({
        pageId: "1137356672785125",
        channelThreadId: "122098025780693891_1278672180548121",
        content: "hello",
        idempotencyKey: "idemp"
      }),
      /Invalid Facebook Messenger send target/
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
      pageId: "1137356672785125",
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
      pageId: "1137356672785125",
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

test("Facebook adapter sendMessage works without pageId via /me/messages", async () => {
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({ message_id: "mid.no-page-id" }), { status: 200 });
  }) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    const result = await adapter.sendMessage({
      channelThreadId: "user:12345",
      content: "hello",
      idempotencyKey: "idemp"
    });
    assert.equal(result.externalMessageId, "mid.no-page-id");
    assert.equal(requestUrl.includes("/me/messages"), true);
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
    assert.deepEqual(normalized.metadataJson, {});
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
    if (String(url).includes("fields=message&")) {
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
    assert.deepEqual(normalized.metadataJson, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment ingest Graph post message becomes safe source_post_snippet metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (
      String(url).includes("1137356672785125_122105157068693891") &&
      String(url).includes("fields=message")
    ) {
      return new Response(JSON.stringify({ message: "Parent post marketing copy" }), { status: 200 });
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
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169789",
                message: "Interested in this product",
                time: 1777441629
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.text, "Interested in this product");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.source_post_snippet, "Parent post marketing copy");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.source_post_source, "ingest_graph");
    assert.equal("rawPayload" in (normalized.metadataJson ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook reaction feed event is ignored and does not create inbound message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await assert.rejects(
      adapter.receiveMessage({
        entry: [
          {
            id: "1137356672785125",
            changes: [
              {
                field: "feed",
                value: {
                  item: "reaction",
                  verb: "add",
                  from: { id: "27244508575134096", name: "Reactor" },
                  post_id: "1137356672785125_122105157068693891",
                  message: "Parent post marketing copy",
                  time: 1777441630
                }
              }
            ]
          }
        ]
      }),
      /Unsupported Facebook webhook event payload/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook status feed post is not ingested as a comment lead", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as any;
  try {
    const adapter = new FacebookAdapter({ pageAccessToken: "token" });
    await assert.rejects(
      adapter.receiveMessage({
        entry: [
          {
            id: "1137356672785125",
            changes: [
              {
                field: "feed",
                value: {
                  item: "status",
                  verb: "add",
                  from: { id: "1137356672785125", name: "Page" },
                  post_id: "1137356672785125_122105157068693891",
                  message: "Parent post marketing copy",
                  time: 1777441631
                }
              }
            ]
          }
        ]
      }),
      /Unsupported Facebook webhook event payload/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment without text uses [comment] fallback not parent post snippet", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (
      String(url).includes("1137356672785125_122105157068693891") &&
      String(url).includes("fields=message")
    ) {
      return new Response(JSON.stringify({ message: "Parent post marketing copy" }), { status: 200 });
    }
    if (String(url).includes("fields=message&")) {
      return new Response(JSON.stringify({ message: "" }), { status: 200 });
    }
    if (String(url).includes("fields=id,message,created_time,from,attachment,permalink_url")) {
      return new Response(JSON.stringify({ id: "122105157068693891_1426457839169790", message: "" }), {
        status: 200
      });
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
                item: "comment",
                verb: "add",
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169790",
                message: "",
                time: 1777441632
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.text, "[comment]");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.source_post_snippet, "Parent post marketing copy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment value.photo alone does not persist source_post_thumbnail_url", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("fields=message,full_picture")) {
      return new Response(JSON.stringify({ message: "", full_picture: "" }), { status: 200 });
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
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169792",
                photo: "https://cdn.facebook.com/comment-attachment-only.jpg",
                message: "Interested",
                time: 1777441634
              }
            }
          ]
        }
      ]
    });
    const metadata = (normalized.metadataJson ?? {}) as Record<string, unknown>;
    assert.equal(metadata.source_post_thumbnail_url, undefined);
    assert.equal(metadata.source_post_snippet, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment value.photo with Graph full_picture uses parent post thumbnail not value.photo", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("fields=message,full_picture")) {
      return new Response(
        JSON.stringify({
          message: "Parent post marketing copy",
          full_picture: "https://cdn.facebook.com/parent-full-picture.jpg"
        }),
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
          id: "1137356672785125",
          changes: [
            {
              field: "feed",
              value: {
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169793",
                photo: "https://cdn.facebook.com/comment-attachment.jpg",
                message: "Interested",
                time: 1777441635
              }
            }
          ]
        }
      ]
    });
    const metadata = (normalized.metadataJson ?? {}) as Record<string, unknown>;
    assert.equal(metadata.source_post_snippet, "Parent post marketing copy");
    assert.equal(metadata.source_post_thumbnail_url, "https://cdn.facebook.com/parent-full-picture.jpg");
    assert.notEqual(metadata.source_post_thumbnail_url, "https://cdn.facebook.com/comment-attachment.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment value.photo still enriches parent post snippet from Graph", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes("fields=message,full_picture")) {
      return new Response(
        JSON.stringify({
          message: "Parent post marketing copy",
          full_picture: "https://cdn.facebook.com/parent-full-picture.jpg"
        }),
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
          id: "1137356672785125",
          changes: [
            {
              field: "feed",
              value: {
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169794",
                photo: "https://cdn.facebook.com/comment-attachment.jpg",
                message: "สนใจ\nขอราคาด้วยค่ะ",
                time: 1777441636
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.text, "สนใจ\nขอราคาด้วยค่ะ");
    const metadata = (normalized.metadataJson ?? {}) as Record<string, unknown>;
    assert.equal(metadata.source_post_snippet, "Parent post marketing copy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Facebook comment with real text still maps comment body not parent post", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    if (
      String(url).includes("1137356672785125_122105157068693891") &&
      String(url).includes("fields=message")
    ) {
      return new Response(JSON.stringify({ message: "Parent post marketing copy" }), { status: 200 });
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
                item: "comment",
                verb: "add",
                from: { id: "27244508575134096", name: "Commenter" },
                post_id: "1137356672785125_122105157068693891",
                comment_id: "122105157068693891_1426457839169791",
                message: "ขอรายละเอียดคะ",
                time: 1777441633
              }
            }
          ]
        }
      ]
    });
    assert.equal(normalized.text, "ขอรายละเอียดคะ");
    assert.equal((normalized.metadataJson as Record<string, unknown>)?.source_post_snippet, "Parent post marketing copy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
