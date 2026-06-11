import test from "node:test";
import assert from "node:assert/strict";
import {
  attachSourcePostMetadataToConversationRows,
  collectSourcePostMetadataCandidateConversationIds,
  isSourcePostMetadataCandidateRow,
  loadSourcePostMetadataForConversationListRows
} from "./bridgeConversationListSourcePostMetadata.js";

test("isSourcePostMetadataCandidateRow matches Facebook and Instagram comment threads", () => {
  assert.equal(
    isSourcePostMetadataCandidateRow({
      id: "c1",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT"
    }),
    true
  );
  assert.equal(
    isSourcePostMetadataCandidateRow({
      id: "c2",
      channel_type: "INSTAGRAM",
      provider_thread_type: "INSTAGRAM_COMMENT"
    }),
    true
  );
});

test("isSourcePostMetadataCandidateRow rejects LINE and Meta DM threads", () => {
  assert.equal(
    isSourcePostMetadataCandidateRow({
      id: "line",
      channel_type: "LINE",
      provider_thread_type: null
    }),
    false
  );
  assert.equal(
    isSourcePostMetadataCandidateRow({
      id: "fb-dm",
      channel_type: "FACEBOOK",
      provider_thread_type: "MESSENGER_DM"
    }),
    false
  );
  assert.equal(
    isSourcePostMetadataCandidateRow({
      id: "ig-dm",
      channel_type: "INSTAGRAM",
      provider_thread_type: "INSTAGRAM_DM"
    }),
    false
  );
});

test("collectSourcePostMetadataCandidateConversationIds is bounded to eligible rows only", () => {
  const ids = collectSourcePostMetadataCandidateConversationIds([
    { id: "fb-comment", channel_type: "FACEBOOK", provider_thread_type: "FACEBOOK_COMMENT" },
    { id: "line", channel_type: "LINE" },
    { id: "ig-comment", channel_type: "INSTAGRAM", provider_thread_type: "INSTAGRAM_COMMENT" }
  ]);
  assert.deepEqual(ids.sort(), ["fb-comment", "ig-comment"]);
});

test("attachSourcePostMetadataToConversationRows adds source_post_message_metadata only when safe snippet exists", () => {
  const rows = attachSourcePostMetadataToConversationRows(
    [
      { id: "c1", channel_type: "FACEBOOK" },
      { id: "c2", channel_type: "FACEBOOK" }
    ],
    new Map([
      [
        "c1",
        {
          source_post_snippet: "Parent post text",
          source_post_captured_at: "2026-06-01T09:00:00.000Z",
          source_post_source: "ingest_graph"
        }
      ],
      ["c2", {}]
    ])
  );
  assert.deepEqual(rows[0]?.source_post_message_metadata, {
    source_post_snippet: "Parent post text",
    source_post_captured_at: "2026-06-01T09:00:00.000Z",
    source_post_source: "ingest_graph"
  });
  assert.equal("source_post_message_metadata" in (rows[1] ?? {}), false);
});

test("loadSourcePostMetadataForConversationListRows uses one bounded repository lookup", async () => {
  let lookupCalls = 0;
  let lookupIds: string[] = [];
  const metadata = await loadSourcePostMetadataForConversationListRows({
    tenantId: "tenant-1",
    rows: [
      { id: "fb-comment", channel_type: "FACEBOOK", provider_thread_type: "FACEBOOK_COMMENT" },
      { id: "line", channel_type: "LINE" }
    ],
    messageRepository: {
      findLatestInboundSourcePostMetadataByConversationIds: async (input) => {
        lookupCalls += 1;
        lookupIds = input.conversationIds;
        return new Map([
          [
            "fb-comment",
            {
              source_post_snippet: "Parent post text",
              source_post_captured_at: "2026-06-01T09:00:00.000Z"
            }
          ]
        ]);
      }
    }
  });
  assert.equal(lookupCalls, 1);
  assert.deepEqual(lookupIds, ["fb-comment"]);
  assert.equal(metadata.get("fb-comment")?.source_post_snippet, "Parent post text");
});

test("loadSourcePostMetadataForConversationListRows fail-open when repository lookup throws", async () => {
  const metadata = await loadSourcePostMetadataForConversationListRows({
    tenantId: "tenant-1",
    rows: [{ id: "fb-comment", channel_type: "FACEBOOK", provider_thread_type: "FACEBOOK_COMMENT" }],
    messageRepository: {
      findLatestInboundSourcePostMetadataByConversationIds: async () => {
        throw new Error("db unavailable");
      }
    }
  });
  assert.equal(metadata.size, 0);
});
