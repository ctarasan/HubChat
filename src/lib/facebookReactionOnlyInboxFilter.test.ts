import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFacebookReactionOnlyInboxListFilter,
  buildFacebookReactionOnlyInboxExclusionOrFilter,
  filterFacebookReactionOnlyInboxRows,
  findFacebookCommentConversationIdsWithRealInboundText,
  isFacebookReactionOnlyInboxCandidate,
  isFacebookReactionOnlyInboxRow,
  isRealFacebookCommentInboundMessageContent
} from "./facebookReactionOnlyInboxFilter.js";
import { filterLineEventOnlyInboxRows } from "./lineEventOnlyInboxFilter.js";

test("isFacebookReactionOnlyInboxCandidate matches Facebook Comment rows with [reaction] preview", () => {
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    }),
    true
  );
});

test("isFacebookReactionOnlyInboxCandidate keeps real Facebook Comment previews visible", () => {
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "ขอรายละเอียดคะ"
    }),
    false
  );
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "....."
    }),
    false
  );
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[comment]"
    }),
    false
  );
});

test("isFacebookReactionOnlyInboxCandidate does not affect Facebook DM, Instagram, or LINE rows", () => {
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "FACEBOOK",
      provider_thread_type: "MESSENGER_DM",
      last_message_preview: "[reaction]"
    }),
    false
  );
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "INSTAGRAM",
      provider_thread_type: "INSTAGRAM_COMMENT",
      last_message_preview: "[reaction]"
    }),
    false
  );
  assert.equal(
    isFacebookReactionOnlyInboxCandidate({
      channel_type: "LINE",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    }),
    false
  );
});

test("isFacebookReactionOnlyInboxRow keeps reaction-preview rows with real inbound messages", () => {
  const withReal = new Set(["conv-real"]);
  assert.equal(
    isFacebookReactionOnlyInboxRow(
      {
        id: "conv-real",
        channel_type: "FACEBOOK",
        provider_thread_type: "FACEBOOK_COMMENT",
        last_message_preview: "[reaction]"
      },
      withReal
    ),
    false
  );
  assert.equal(
    isFacebookReactionOnlyInboxRow(
      {
        id: "conv-reaction-only",
        channel_type: "FACEBOOK",
        provider_thread_type: "FACEBOOK_COMMENT",
        last_message_preview: "[reaction]"
      },
      withReal
    ),
    true
  );
});

test("filterFacebookReactionOnlyInboxRows removes only Facebook Comment reaction-only rows", () => {
  const rows = [
    {
      id: "fb-reaction",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    },
    {
      id: "fb-real",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "สนใจ"
    },
    {
      id: "fb-comment-fallback",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[comment]"
    },
    {
      id: "fb-dm",
      channel_type: "FACEBOOK",
      provider_thread_type: "MESSENGER_DM",
      last_message_preview: "[reaction]"
    },
    {
      id: "line-event",
      channel_type: "LINE",
      last_message_preview: "[event]"
    }
  ];
  const filtered = filterFacebookReactionOnlyInboxRows(rows);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["fb-real", "fb-comment-fallback", "fb-dm", "line-event"]
  );
});

test("LINE-EVT-1 and Facebook reaction filters compose without cross-channel regressions", () => {
  const rows = [
    { id: "line-event", channel_type: "LINE", last_message_preview: "[event]" },
    { id: "line-real", channel_type: "LINE", last_message_preview: "hello" },
    {
      id: "fb-reaction",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    },
    {
      id: "fb-real",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "hello"
    }
  ];
  const visible = filterFacebookReactionOnlyInboxRows(filterLineEventOnlyInboxRows(rows));
  assert.deepEqual(
    visible.map((row) => row.id),
    ["line-real", "fb-real"]
  );
});

test("buildFacebookReactionOnlyInboxExclusionOrFilter excludes Facebook Comment reaction previews", () => {
  const expr = buildFacebookReactionOnlyInboxExclusionOrFilter();
  assert.match(expr, /channel_type\.neq\.FACEBOOK/);
  assert.match(expr, /provider_thread_type\.neq\.FACEBOOK_COMMENT/);
  assert.match(expr, /last_message_preview\.neq\.\[reaction\]/);
  assert.match(expr, /last_message_preview\.is\.null/);
});

test("isRealFacebookCommentInboundMessageContent treats placeholders narrowly", () => {
  assert.equal(isRealFacebookCommentInboundMessageContent("[reaction]"), false);
  assert.equal(isRealFacebookCommentInboundMessageContent(""), false);
  assert.equal(isRealFacebookCommentInboundMessageContent("[comment]"), true);
  assert.equal(isRealFacebookCommentInboundMessageContent("."), true);
  assert.equal(isRealFacebookCommentInboundMessageContent("ขอรายละเอียดคะ"), true);
});

test("findFacebookCommentConversationIdsWithRealInboundText returns only conversations with real inbound text", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              neq: () => ({
                not: () => ({
                  limit: async () => ({
                    data: [
                      { conversation_id: "conv-real", content: "ขอรายละเอียดคะ" },
                      { conversation_id: "conv-reaction-only", content: "   " }
                    ],
                    error: null
                  })
                })
              })
            })
          })
        })
      })
    })
  };
  const result = await findFacebookCommentConversationIdsWithRealInboundText(
    supabase as any,
    "tenant-1",
    ["conv-real", "conv-reaction-only"]
  );
  assert.deepEqual([...result], ["conv-real"]);
});

test("applyFacebookReactionOnlyInboxListFilter hides reaction-only rows but keeps bumped conversations with real text", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              neq: () => ({
                not: () => ({
                  limit: async () => ({
                    data: [{ conversation_id: "conv-bumped", content: "สนใจ" }],
                    error: null
                  })
                })
              })
            })
          })
        })
      })
    })
  };
  const rows = [
    {
      id: "conv-reaction-only",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    },
    {
      id: "conv-bumped",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    },
    {
      id: "conv-real",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "....."
    }
  ];
  const filtered = await applyFacebookReactionOnlyInboxListFilter(supabase as any, "tenant-1", rows);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["conv-bumped", "conv-real"]
  );
});
