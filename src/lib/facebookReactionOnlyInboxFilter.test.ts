import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFacebookReactionOnlyInboxListFilter,
  classifyFacebookCommentInboundMessageContent,
  filterFacebookReactionOnlyInboxRows,
  findFacebookCommentConversationIdsWithRealInboundText,
  isFacebookReactionOnlyInboxCandidate,
  isFacebookReactionOnlyInboxRow,
  isRealFacebookCommentInboundMessageContent,
  LEGACY_PARENT_POST_POLLUTION_FIXTURE
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

test("classifyFacebookCommentInboundMessageContent separates placeholders, real comments, and legacy post-body pollution", () => {
  assert.equal(classifyFacebookCommentInboundMessageContent("[reaction]"), "reaction_placeholder");
  assert.equal(classifyFacebookCommentInboundMessageContent("[comment]"), "comment_placeholder");
  assert.equal(classifyFacebookCommentInboundMessageContent(""), "empty");
  assert.equal(classifyFacebookCommentInboundMessageContent("."), "real_lead_comment");
  assert.equal(classifyFacebookCommentInboundMessageContent("....."), "real_lead_comment");
  assert.equal(classifyFacebookCommentInboundMessageContent("สนใจ"), "real_lead_comment");
  assert.equal(classifyFacebookCommentInboundMessageContent("สนใจค่ะ"), "real_lead_comment");
  assert.equal(classifyFacebookCommentInboundMessageContent("ขอรายละเอียดคะ"), "real_lead_comment");
  assert.equal(
    classifyFacebookCommentInboundMessageContent(LEGACY_PARENT_POST_POLLUTION_FIXTURE),
    "legacy_parent_post_pollution"
  );
  assert.equal(
    classifyFacebookCommentInboundMessageContent("line one\nline two"),
    "legacy_parent_post_pollution"
  );
});

test("isRealFacebookCommentInboundMessageContent rescues only real short lead comments", () => {
  assert.equal(isRealFacebookCommentInboundMessageContent("[reaction]"), false);
  assert.equal(isRealFacebookCommentInboundMessageContent("[comment]"), false);
  assert.equal(isRealFacebookCommentInboundMessageContent(""), false);
  assert.equal(isRealFacebookCommentInboundMessageContent("."), true);
  assert.equal(isRealFacebookCommentInboundMessageContent("ขอรายละเอียดคะ"), true);
  assert.equal(isRealFacebookCommentInboundMessageContent(LEGACY_PARENT_POST_POLLUTION_FIXTURE), false);
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

test("findFacebookCommentConversationIdsWithRealInboundText ignores legacy parent-post-body pollution", async () => {
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
                      { conversation_id: "conv-polluted", content: "[reaction]" },
                      { conversation_id: "conv-polluted", content: LEGACY_PARENT_POST_POLLUTION_FIXTURE },
                      { conversation_id: "conv-bumped", content: "[reaction]" },
                      { conversation_id: "conv-bumped", content: "สนใจ" }
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
    ["conv-polluted", "conv-bumped"]
  );
  assert.deepEqual([...result], ["conv-bumped"]);
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

test("applyFacebookReactionOnlyInboxListFilter hides reaction-preview rows polluted by legacy parent post body", async () => {
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
                      { conversation_id: "fb0915ca", content: "[reaction]" },
                      { conversation_id: "fb0915ca", content: "[reaction]" },
                      { conversation_id: "fb0915ca", content: LEGACY_PARENT_POST_POLLUTION_FIXTURE }
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
  const rows = [
    {
      id: "fb0915ca",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "[reaction]"
    },
    {
      id: "fb-real",
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      last_message_preview: "....."
    }
  ];
  const filtered = await applyFacebookReactionOnlyInboxListFilter(supabase as any, "tenant-1", rows);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["fb-real"]
  );
});

test("applyFacebookReactionOnlyInboxListFilter fails open when inbound lookup throws", async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              neq: () => ({
                not: () => ({
                  limit: async () => {
                    throw new Error("messages lookup failed");
                  }
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
    }
  ];
  const filtered = await applyFacebookReactionOnlyInboxListFilter(supabase as any, "tenant-1", rows);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["fb-reaction", "fb-real"]
  );
});
