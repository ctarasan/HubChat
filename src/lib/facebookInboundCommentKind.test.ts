import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFacebookFeedInbound,
  resolveFacebookCommentInboundPreviewText,
  shouldExtractFacebookCommentTextFromPayload,
  shouldIngestFacebookFeedChange,
  shouldSkipFacebookFeedVerb
} from "./facebookInboundCommentKind.js";

test("classifyFacebookFeedInbound identifies reaction events", () => {
  assert.equal(
    classifyFacebookFeedInbound({
      field: "feed",
      value: { item: "reaction", verb: "add" },
      hasCommentText: false,
      hasAttachmentImage: false
    }),
    "reaction"
  );
});

test("classifyFacebookFeedInbound treats status feed posts as non_comment", () => {
  assert.equal(
    classifyFacebookFeedInbound({
      field: "feed",
      value: { item: "status", verb: "add", message: "Parent post marketing copy" },
      hasCommentText: true,
      hasAttachmentImage: false
    }),
    "non_comment"
  );
});

test("shouldIngestFacebookFeedChange skips status posts and remove verbs", () => {
  assert.equal(
    shouldIngestFacebookFeedChange({
      field: "feed",
      value: { item: "status", verb: "add", message: "Parent post marketing copy" },
      hasCommentText: true,
      hasAttachmentImage: false
    }),
    false
  );
  assert.equal(
    shouldIngestFacebookFeedChange({
      field: "feed",
      value: { item: "comment", verb: "remove", comment_id: "1_2", message: "deleted" },
      hasCommentText: true,
      hasAttachmentImage: false
    }),
    false
  );
  assert.equal(shouldSkipFacebookFeedVerb("remove"), true);
});

test("resolveFacebookCommentInboundPreviewText keeps reaction placeholder even when message exists", () => {
  const resolved = resolveFacebookCommentInboundPreviewText({
    kind: "reaction",
    payloadText: "Parent post marketing copy",
    graphDetailText: null,
    graphText: null,
    hasAttachmentImage: false
  });
  assert.equal(resolved.text, "[reaction]");
  assert.equal(resolved.usedPlaceholder, true);
});

test("resolveFacebookCommentInboundPreviewText prefers actual comment text", () => {
  const resolved = resolveFacebookCommentInboundPreviewText({
    kind: "comment_text",
    payloadText: "ขอรายละเอียดคะ",
    graphDetailText: "Parent post marketing copy",
    graphText: null,
    hasAttachmentImage: false
  });
  assert.equal(resolved.text, "ขอรายละเอียดคะ");
  assert.equal(resolved.usedPlaceholder, false);
});

test("resolveFacebookCommentInboundPreviewText uses safe fallback when comment text missing", () => {
  const resolved = resolveFacebookCommentInboundPreviewText({
    kind: "comment_without_text",
    payloadText: null,
    graphDetailText: null,
    graphText: null,
    hasAttachmentImage: false
  });
  assert.equal(resolved.text, "[comment]");
  assert.equal(resolved.usedPlaceholder, true);
});

test("shouldExtractFacebookCommentTextFromPayload is false for reaction", () => {
  assert.equal(shouldExtractFacebookCommentTextFromPayload("reaction"), false);
  assert.equal(shouldExtractFacebookCommentTextFromPayload("comment_text"), true);
});
