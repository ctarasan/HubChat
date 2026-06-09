import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_POST_SNIPPET_MAX_LENGTH,
  buildSourcePostContext,
  isSafePostThumbnailUrl,
  sanitizeSourcePostSnippet
} from "./sourcePostContext.js";

test("buildSourcePostContext returns Facebook comment context with lead snippet", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    channelThreadId: "comment:123_456",
    providerCommentId: "123_456",
    lastMessagePreview: "Do you have this in blue?",
    lastCustomerMessageAt: "2026-06-01T10:00:00.000Z",
    postContent: "Summer sale starts today!",
    postOccurredAt: "2026-06-01T09:00:00.000Z",
    messageMetadata: {
      thumbnailUrl: "https://cdn.example/post-thumb.jpg",
      fullImageUrl: "https://cdn.example/post-full.jpg"
    }
  });
  assert.ok(ctx);
  assert.equal(ctx.channel_type, "FACEBOOK");
  assert.equal(ctx.source_type, "COMMENT");
  assert.equal(ctx.source_label, "Facebook · Comment");
  assert.equal(ctx.lead_comment_snippet, "Do you have this in blue?");
  assert.equal(ctx.post_snippet, "Summer sale starts today!");
  assert.equal(ctx.post_thumbnail_url, "https://cdn.example/post-thumb.jpg");
  assert.equal(ctx.private_reply_status, "not_sent");
  assert.equal(ctx.fallback_message, null);
  assert.equal(ctx.open_post_available, false);
});

test("buildSourcePostContext returns Facebook private reply with sent status", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    privateReplySentAt: "2026-06-01T11:00:00.000Z",
    channelThreadId: "comment:123_456",
    lastMessagePreview: "Thanks, checking stock for you."
  });
  assert.ok(ctx);
  assert.equal(ctx.source_type, "PRIVATE_REPLY");
  assert.equal(ctx.source_label, "Facebook · Private Reply");
  assert.equal(ctx.private_reply_status, "sent");
});

test("buildSourcePostContext returns Instagram comment context", () => {
  const ctx = buildSourcePostContext({
    channelType: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_COMMENT",
    channelThreadId: "ig:comment:17841400000000000_1234567890",
    lastMessagePreview: "Price please?",
    lastMessageAt: "2026-06-02T08:00:00.000Z"
  });
  assert.ok(ctx);
  assert.equal(ctx.channel_type, "INSTAGRAM");
  assert.equal(ctx.source_type, "COMMENT");
  assert.equal(ctx.source_label, "Instagram · Comment");
});

test("buildSourcePostContext returns Instagram private reply context", () => {
  const ctx = buildSourcePostContext({
    channelType: "INSTAGRAM",
    providerThreadType: "INSTAGRAM_COMMENT",
    privateReplySentAt: "2026-06-02T09:00:00.000Z",
    channelThreadId: "ig:comment:17841400000000000_1234567890"
  });
  assert.ok(ctx);
  assert.equal(ctx.source_type, "PRIVATE_REPLY");
  assert.equal(ctx.private_reply_status, "sent");
});

test("buildSourcePostContext returns null for Facebook DM", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "MESSENGER_DM",
    channelThreadId: "user:1234567890",
    lastMessagePreview: "Hello"
  });
  assert.equal(ctx, null);
});

test("buildSourcePostContext returns null for LINE", () => {
  const ctx = buildSourcePostContext({
    channelType: "LINE",
    channelThreadId: "U-line-1",
    lastMessagePreview: "Hi"
  });
  assert.equal(ctx, null);
});

test("buildSourcePostContext strips raw provider IDs from snippets", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    channelThreadId: "comment:541846535668129_122105157068693891",
    lastMessagePreview: "541846535668129_122105157068693891 Great product!"
  });
  assert.ok(ctx);
  assert.equal(ctx.lead_comment_snippet, "Great product!");
  const serialized = JSON.stringify(ctx);
  assert.equal(serialized.includes("541846535668129"), false);
  assert.equal(serialized.includes("122105157068693891"), false);
});

test("buildSourcePostContext does not leak tokens or raw payload strings", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    channelThreadId: "comment:1_2",
    lastMessagePreview: "Need help",
    messageMetadata: {
      rawPayload: { comment_id: "secret" },
      thumbnailUrl: "https://cdn.example/post.jpg"
    }
  });
  const serialized = JSON.stringify(ctx);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("EAAG"), false);
  assert.equal(serialized.includes("secret"), false);
});

test("sanitizeSourcePostSnippet truncates long text safely", () => {
  const long = "a".repeat(SOURCE_POST_SNIPPET_MAX_LENGTH + 40);
  const snippet = sanitizeSourcePostSnippet(long);
  assert.ok(snippet);
  assert.ok(snippet.length <= SOURCE_POST_SNIPPET_MAX_LENGTH + 1);
  assert.ok(snippet.endsWith("…"));
});

test("buildSourcePostContext returns fallback when post detail is missing", () => {
  const ctx = buildSourcePostContext({
    channelType: "FACEBOOK",
    providerThreadType: "FACEBOOK_COMMENT",
    channelThreadId: "comment:1_2",
    lastMessagePreview: "Is this available?"
  });
  assert.ok(ctx);
  assert.equal(ctx.post_snippet, null);
  assert.equal(ctx.post_thumbnail_url, null);
  assert.equal(
    ctx.fallback_message,
    "This lead came from a Facebook comment. Post details are not available yet."
  );
});

test("isSafePostThumbnailUrl rejects profile image URLs", () => {
  assert.equal(isSafePostThumbnailUrl("https://fbcdn.net/profile_pic.jpg"), false);
  assert.equal(isSafePostThumbnailUrl("https://cdn.example/post-media.jpg"), true);
  assert.equal(isSafePostThumbnailUrl("http://cdn.example/post.jpg"), false);
});
