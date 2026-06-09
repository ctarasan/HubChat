import test from "node:test";
import assert from "node:assert/strict";
import { classifyLeadSource } from "./leadSourceClassification.js";

test("classifyLeadSource maps Facebook DM", () => {
  const result = classifyLeadSource({
    channelType: "FACEBOOK",
    providerThreadType: "MESSENGER_DM",
    channelThreadId: "user:12345678901234567"
  });
  assert.equal(result.sourceType, "DM");
  assert.equal(result.sourceLabel, "Direct Message");
  assert.equal(result.hasCommentContext, false);
  assert.equal(result.hasPrivateReply, false);
});

test("classifyLeadSource maps Facebook Comment", () => {
  const result = classifyLeadSource({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    channelThreadId: "comment:123_456",
    providerCommentId: "123_456"
  });
  assert.equal(result.sourceType, "COMMENT");
  assert.equal(result.sourceLabel, "Comment");
  assert.equal(result.hasCommentContext, true);
  assert.equal(result.hasPrivateReply, false);
});

test("classifyLeadSource maps Facebook Private Reply after conversion", () => {
  const result = classifyLeadSource({
    channelType: "FACEBOOK",
    providerThreadType: "MESSENGER_DM",
    channelThreadId: "user:12345678901234567",
    privateReplySentAt: "2026-06-01T10:00:00.000Z",
    providerCommentId: "123_456"
  });
  assert.equal(result.sourceType, "PRIVATE_REPLY");
  assert.equal(result.sourceLabel, "Private Reply");
  assert.equal(result.hasCommentContext, true);
  assert.equal(result.hasPrivateReply, true);
});

test("classifyLeadSource maps Instagram DM", () => {
  const result = classifyLeadSource({
    channelType: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_DM",
    channelThreadId: "ig:user:959986016929726"
  });
  assert.equal(result.sourceType, "DM");
  assert.equal(result.hasCommentContext, false);
  assert.equal(result.hasPrivateReply, false);
});

test("classifyLeadSource maps Instagram Comment", () => {
  const result = classifyLeadSource({
    channelType: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_COMMENT",
    channelThreadId: "ig:comment:17841400000000000_1234567890"
  });
  assert.equal(result.sourceType, "COMMENT");
  assert.equal(result.hasCommentContext, true);
  assert.equal(result.hasPrivateReply, false);
});

test("classifyLeadSource maps Instagram Private Reply", () => {
  const result = classifyLeadSource({
    channelType: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_COMMENT",
    channelThreadId: "ig:comment:17841400000000000_1234567890",
    privateReplySentAt: "2026-06-01T11:00:00.000Z"
  });
  assert.equal(result.sourceType, "PRIVATE_REPLY");
  assert.equal(result.hasCommentContext, true);
  assert.equal(result.hasPrivateReply, true);
});

test("classifyLeadSource maps LINE Chat", () => {
  const result = classifyLeadSource({
    channelType: "LINE",
    providerThreadType: null,
    channelThreadId: "U-line-thread-1"
  });
  assert.equal(result.sourceType, "CHAT");
  assert.equal(result.sourceLabel, "Chat");
  assert.equal(result.hasCommentContext, false);
  assert.equal(result.hasPrivateReply, false);
});

test("classifyLeadSource falls back to UNKNOWN for unsupported channel", () => {
  const result = classifyLeadSource({
    channelType: "TIKTOK",
    providerThreadType: null,
    channelThreadId: "thread-1"
  });
  assert.equal(result.sourceType, "UNKNOWN");
  assert.equal(result.sourceLabel, "Unknown");
  assert.equal(result.hasCommentContext, false);
  assert.equal(result.hasPrivateReply, false);
});
