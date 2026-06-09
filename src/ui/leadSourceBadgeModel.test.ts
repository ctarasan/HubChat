import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLeadSourceBadge,
  resolveLeadSourceBadgeKey,
  leadSourceBadgeClassName,
  readLeadSourceFieldsFromRow
} from "./leadSourceBadgeModel.js";

test("conversation source_type DM maps Facebook to Facebook · DM", () => {
  const key = resolveLeadSourceBadgeKey({
    channel_type: "FACEBOOK",
    source_type: "DM"
  });
  assert.equal(key, "FACEBOOK_DM");
  assert.equal(
    resolveLeadSourceBadge({ channel_type: "FACEBOOK", source_type: "DM" }).label,
    "Facebook · DM"
  );
});

test("conversation source_type COMMENT maps to Facebook · Comment", () => {
  assert.equal(
    resolveLeadSourceBadgeKey({
      channel_type: "FACEBOOK",
      source_type: "COMMENT",
      has_comment_context: true
    }),
    "FACEBOOK_COMMENT"
  );
});

test("conversation source_type PRIVATE_REPLY maps to Facebook · Private Reply", () => {
  assert.equal(
    resolveLeadSourceBadgeKey({
      channel_type: "FACEBOOK",
      source_type: "PRIVATE_REPLY",
      has_comment_context: true,
      has_private_reply: true
    }),
    "FACEBOOK_PRIVATE_REPLY"
  );
});

test("lead sourceType maps Instagram DM", () => {
  assert.equal(
    resolveLeadSourceBadgeKey({ channelType: "INSTAGRAM", sourceType: "DM" }),
    "INSTAGRAM_DM"
  );
});

test("lead sourceType maps Instagram COMMENT and PRIVATE_REPLY", () => {
  assert.equal(
    resolveLeadSourceBadgeKey({ channelType: "INSTAGRAM", sourceType: "COMMENT" }),
    "INSTAGRAM_COMMENT"
  );
  assert.equal(
    resolveLeadSourceBadgeKey({ channelType: "INSTAGRAM", sourceType: "PRIVATE_REPLY" }),
    "INSTAGRAM_PRIVATE_REPLY"
  );
});

test("sourceType CHAT maps LINE to LINE · Chat", () => {
  assert.equal(resolveLeadSourceBadgeKey({ channel_type: "LINE", source_type: "CHAT" }), "LINE_CHAT");
  assert.equal(resolveLeadSourceBadge({ channel_type: "LINE", source_type: "CHAT" }).label, "LINE · Chat");
});

test("unknown channel maps to Unknown fallback", () => {
  assert.equal(resolveLeadSourceBadgeKey({ channel_type: "SHOPEE", source_type: "DM" }), "UNKNOWN");
});

test("legacy fallback uses provider_thread_type when source_type absent", () => {
  assert.equal(
    resolveLeadSourceBadgeKey({
      channel_type: "FACEBOOK",
      provider_thread_type: "FACEBOOK_COMMENT",
      private_reply_sent_at: "2026-06-08T10:00:00.000Z"
    }),
    "FACEBOOK_PRIVATE_REPLY"
  );
  assert.equal(
    resolveLeadSourceBadgeKey({
      channel_type: "INSTAGRAM",
      provider_thread_type: "INSTAGRAM_DM"
    }),
    "INSTAGRAM_DM"
  );
});

test("readLeadSourceFieldsFromRow reads snake_case and camelCase", () => {
  const input = readLeadSourceFieldsFromRow({
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    source_label: "Comment",
    has_comment_context: true,
    has_private_reply: false
  });
  assert.equal(resolveLeadSourceBadgeKey(input), "FACEBOOK_COMMENT");

  const leadInput = readLeadSourceFieldsFromRow({
    channel: "INSTAGRAM",
    sourceType: "PRIVATE_REPLY",
    hasPrivateReply: true
  });
  assert.equal(resolveLeadSourceBadgeKey(leadInput), "INSTAGRAM_PRIVATE_REPLY");
});

test("badge class names are stable and test ids are unique", () => {
  const fb = resolveLeadSourceBadge({ channel_type: "FACEBOOK", source_type: "DM" });
  assert.equal(fb.className, leadSourceBadgeClassName("FACEBOOK_DM"));
  assert.equal(fb.testId, "lead-source-badge-facebook-dm");
  const unknown = resolveLeadSourceBadge({ channel_type: "X", source_type: "UNKNOWN" });
  assert.equal(unknown.testId, "lead-source-badge-unknown");
});
