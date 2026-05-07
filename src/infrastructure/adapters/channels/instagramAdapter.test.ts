import test from "node:test";
import assert from "node:assert/strict";
import { extractInstagramRecipientIgsidFromThreadId, InstagramAdapter } from "./instagramAdapter.js";
import { InstagramGraphApiError } from "./instagramGraphApiError.js";

function fakePageAccessToken(): string {
  return `EA${"A".repeat(78)}`;
}

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

test("extractInstagramRecipientIgsidFromThreadId extracts numeric IGSID", () => {
  assert.equal(extractInstagramRecipientIgsidFromThreadId("ig:user:959986016929726"), "959986016929726");
});

test("invalid channelThreadId yields null IGSID", () => {
  assert.equal(extractInstagramRecipientIgsidFromThreadId("959986016929726"), null);
  assert.equal(extractInstagramRecipientIgsidFromThreadId("ig:user:"), null);
  assert.equal(extractInstagramRecipientIgsidFromThreadId("ig:user:abc"), null);
});

test("Instagram outbound text send posts to configured PAGE_ID with recipient.id and no token in JSON body", async () => {
  let capturedUrl = "";
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    capturedUrl = String(url);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "ig-sent-1" }), { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({
      accessToken: fakePageAccessToken(),
      graphVersion: "v25.0",
      pageId: "1137356672785125"
    });
    const sent = await adapter.sendMessage({
      channelThreadId: "ig:user:959986016929726",
      content: "reply text",
      idempotencyKey: "idemp-ig-1",
      messageType: "TEXT",
      outboundDebugContext: { messageId: "m1", conversationId: "c1" }
    });
    assert.equal(requestBody.recipient.id, "959986016929726");
    assert.deepEqual(Object.keys(requestBody).sort(), ["message", "recipient"].sort());
    assert.equal(Object.prototype.hasOwnProperty.call(requestBody, "access_token"), false);
    assert.equal(capturedUrl.includes("access_token="), true);
    assert.match(capturedUrl, /graph\.facebook\.com\/v25\.0\/1137356672785125\/messages\?access_token=/);
    assert.equal(requestBody.message.text, "reply text");
    assert.equal(sent.externalMessageId, "ig-sent-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram outbound POST /{PAGE_ID}/messages when pageId is configured", async () => {
  let capturedUrl = "";
  let requestBody: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    capturedUrl = String(url);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ message_id: "sent-p" }), { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({
      accessToken: fakePageAccessToken(),
      graphVersion: "v25.0",
      pageId: "123456789"
    });
    await adapter.sendMessage({
      pageId: "999888777666555",
      channelThreadId: "ig:user:111",
      content: "hi",
      idempotencyKey: "k1",
      messageType: "TEXT"
    });
    assert.match(capturedUrl, /\/v25\.0\/123456789\/messages\?access_token=/);
    assert.equal(requestBody.recipient.id, "111");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram outbound with no config.pageId fails locally and does not call fetch", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any) => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ message_id: "m-me" }), { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({ accessToken: fakePageAccessToken(), graphVersion: "v25.0" });
    await assert.rejects(
      adapter.sendMessage({
        pageId: "777777777777777",
        channelThreadId: "ig:user:222",
        content: "hey",
        idempotencyKey: "k-me",
        messageType: "TEXT"
      }),
      /Instagram outbound requires FACEBOOK_PAGE_ID or INSTAGRAM_PAGE_ID/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram outbound rejects invalid channelThreadId before Meta call", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({
      accessToken: fakePageAccessToken(),
      graphVersion: "v25.0",
      pageId: "1137356672785125"
    });
    await assert.rejects(
      adapter.sendMessage({
        channelThreadId: "user:bad",
        content: "x",
        idempotencyKey: "k",
        messageType: "TEXT"
      }),
      /ig:user/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram outbound IMAGE fails locally without Meta call", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as any;
  try {
    const adapter = new InstagramAdapter({
      accessToken: fakePageAccessToken(),
      graphVersion: "v25.0",
      pageId: "1137356672785125"
    });
    await assert.rejects(
      adapter.sendMessage({
        channelThreadId: "ig:user:1",
        content: "x",
        idempotencyKey: "k",
        messageType: "IMAGE"
      }),
      /Instagram DM Phase 1 supports text messages only/
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram outbound empty trimmed text fails locally", async () => {
  const adapter = new InstagramAdapter({ accessToken: fakePageAccessToken(), graphVersion: "v25.0" });
  await assert.rejects(
    adapter.sendMessage({
      channelThreadId: "ig:user:1",
      content: "   ",
      idempotencyKey: "k",
      messageType: "TEXT"
    }),
    /cannot be empty/
  );
});

test("Instagram outbound text over 1000 UTF-8 bytes fails locally", async () => {
  const adapter = new InstagramAdapter({ accessToken: fakePageAccessToken(), graphVersion: "v25.0" });
  const long = "a".repeat(1001);
  await assert.rejects(
    adapter.sendMessage({
      channelThreadId: "ig:user:1",
      content: long,
      idempotencyKey: "k",
      messageType: "TEXT"
    }),
    /1000 bytes/
  );
});

test("Instagram outbound Meta 400 throws InstagramGraphApiError with parsed fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        error: {
          message: "Invalid",
          type: "OAuthException",
          code: 190,
          error_subcode: 463,
          fbtrace_id: "TRACE1"
        }
      }),
      { status: 400 }
    );
  }) as any;
  try {
    const adapter = new InstagramAdapter({
      accessToken: fakePageAccessToken(),
      graphVersion: "v25.0",
      pageId: "1137356672785125"
    });
    try {
      await adapter.sendMessage({
        channelThreadId: "ig:user:22",
        content: "hi",
        idempotencyKey: "k",
        messageType: "TEXT"
      });
      assert.fail("expected InstagramGraphApiError");
    } catch (e) {
      assert.ok(e instanceof InstagramGraphApiError);
      const err = e as InstagramGraphApiError;
      assert.equal(err.httpStatus, 400);
      assert.equal(err.meta.code, 190);
      assert.equal(err.meta.error_subcode, 463);
      assert.equal(err.meta.fbtrace_id, "TRACE1");
      assert.equal(err.meta.type, "OAuthException");
      assert.equal(err.graphPathForLog, "/v25.0/1137356672785125/messages");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
