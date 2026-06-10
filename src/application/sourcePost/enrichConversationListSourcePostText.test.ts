import test from "node:test";
import assert from "node:assert/strict";
import {
  conversationNeedsSourcePostTextEnrichment,
  enrichConversationListSourcePostText
} from "./enrichConversationListSourcePostText.js";

test("conversationNeedsSourcePostTextEnrichment excludes LINE and Facebook DM", () => {
  assert.equal(conversationNeedsSourcePostTextEnrichment({ channel_type: "LINE" }), false);
  assert.equal(
    conversationNeedsSourcePostTextEnrichment({
      channel_type: "FACEBOOK",
      provider_thread_type: "MESSENGER_DM"
    }),
    false
  );
});

test("enrichConversationListSourcePostText attaches post snippet from earliest inbound metadata", async () => {
  const rows = await enrichConversationListSourcePostText({
    tenantId: "tenant-1",
    rows: [
      {
        id: "conv-fb",
        channel_type: "FACEBOOK",
        provider_thread_type: "FACEBOOK_COMMENT",
        last_message_preview: "Is this available?"
      },
      {
        id: "conv-line",
        channel_type: "LINE"
      }
    ],
    messageRepository: {
      findEarliestInboundMetadataByConversationIds: async () =>
        new Map([
          [
            "conv-fb",
            {
              metadataJson: { post_message: "Summer sale starts this weekend." },
              createdAt: "2026-06-01T09:00:00.000Z"
            }
          ]
        ])
    }
  });

  const fb = rows.find((row) => row.id === "conv-fb")!;
  assert.equal(fb.source_post_snippet, "Summer sale starts this weekend.");
  assert.equal(fb.source_post_timestamp, "2026-06-01T09:00:00.000Z");
  assert.equal(rows.find((row) => row.id === "conv-line")?.source_post_snippet, undefined);
});

test("enrichConversationListSourcePostText ignores unsafe metadata values", async () => {
  const rows = await enrichConversationListSourcePostText({
    tenantId: "tenant-1",
    rows: [
      {
        id: "conv-ig",
        channel_type: "INSTAGRAM",
        provider_thread_type: "INSTAGRAM_COMMENT",
        private_reply_sent_at: "2026-06-02T09:00:00.000Z"
      }
    ],
    messageRepository: {
      findEarliestInboundMetadataByConversationIds: async () =>
        new Map([
          [
            "conv-ig",
            {
              metadataJson: {
                post_caption: "https://instagram.com/p/abc123",
                rawPayload: { message: "secret" }
              },
              createdAt: "2026-06-02T08:00:00.000Z"
            }
          ]
        ])
    }
  });

  assert.equal(rows[0]?.source_post_snippet, undefined);
});

test("enrichConversationListSourcePostText attaches post snippet for Instagram private reply", async () => {
  const rows = await enrichConversationListSourcePostText({
    tenantId: "tenant-1",
    rows: [
      {
        id: "conv-ig-pr",
        channel_type: "INSTAGRAM",
        provider_thread_type: "INSTAGRAM_COMMENT",
        private_reply_sent_at: "2026-06-02T09:00:00.000Z"
      }
    ],
    messageRepository: {
      findEarliestInboundMetadataByConversationIds: async () =>
        new Map([
          [
            "conv-ig-pr",
            {
              metadataJson: { post_caption: "New collection drop — DM us for styling tips." },
              createdAt: "2026-06-02T08:00:00.000Z"
            }
          ]
        ])
    }
  });

  assert.equal(rows[0]?.source_post_snippet, "New collection drop — DM us for styling tips.");
});

test("enrichConversationListSourcePostText is no-op without repository lookup", async () => {
  const input = [{ id: "conv-1", channel_type: "FACEBOOK", provider_thread_type: "FACEBOOK_COMMENT" }];
  const rows = await enrichConversationListSourcePostText({
    tenantId: "tenant-1",
    rows: input,
    messageRepository: null
  });
  assert.deepEqual(rows, input);
});
