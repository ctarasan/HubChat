import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourcePostContextViewModel,
  isSafeOpenPostHref,
  isUnsafeSourcePostContent,
  resolveSourcePostContext,
  sanitizeSourcePostText,
  sourcePostContextViewIsSafe,
  truncateSourcePostText
} from "./sourcePostContextModel.js";

const facebookCommentApi = {
  source_post_context: {
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    source_label: "Facebook · Comment",
    post_thumbnail_url: "https://cdn.example.com/post-thumb.jpg",
    post_snippet: "Summer sale starts this weekend — comment below for details.",
    lead_comment_snippet: "Is this still available in size M?",
    private_reply_status: "sent",
    open_post_available: true,
    open_post_href: "https://www.facebook.com/permalink.php?story_fbid=safe",
    fallback_message: null
  }
};

const instagramPrivateReplyApi = {
  sourcePostContext: {
    channel_type: "INSTAGRAM",
    source_type: "PRIVATE_REPLY",
    source_label: "Instagram · Private Reply",
    post_snippet: "New collection drop — DM us for styling tips.",
    lead_comment_snippet: "Love this look!",
    private_reply_status: "sent",
    open_post_available: false,
    fallback_message: null
  }
};

test("resolveSourcePostContext returns null for LINE and Facebook DM", () => {
  assert.equal(
    resolveSourcePostContext({ channel_type: "LINE", source_type: "CHAT" }),
    null
  );
  assert.equal(
    resolveSourcePostContext({ channel_type: "FACEBOOK", source_type: "DM" }),
    null
  );
});

test("resolveSourcePostContext renders Facebook Comment card from API", () => {
  const view = resolveSourcePostContext({
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    has_comment_context: true,
    ...facebookCommentApi
  });
  assert.ok(view);
  assert.equal(view?.sourceBadgeLabel, "Facebook · Comment");
  assert.equal(view?.postDetailsAvailable, true);
  assert.equal(view?.postThumbnailUrl, "https://cdn.example.com/post-thumb.jpg");
  assert.equal(view?.privateReplySent, true);
  assert.equal(view?.openPostAvailable, true);
  assert.match(view?.leadComment ?? "", /size M/);
});

test("resolveSourcePostContext renders Instagram Private Reply without thumbnail placeholder", () => {
  const view = resolveSourcePostContext({
    channel_type: "INSTAGRAM",
    source_type: "PRIVATE_REPLY",
    has_comment_context: true,
    has_private_reply: true,
    ...instagramPrivateReplyApi
  });
  assert.ok(view);
  assert.equal(view?.kind, "INSTAGRAM_PRIVATE_REPLY");
  assert.equal(view?.postThumbnailUrl, null);
  assert.equal(view?.showThumbnailPlaceholder, false);
  assert.equal(view?.openPostAvailable, false);
});

test("resolveSourcePostContext renders fallback when post details missing", () => {
  const view = resolveSourcePostContext({
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    has_comment_context: true,
    source_post_context: {
      channel_type: "FACEBOOK",
      source_type: "COMMENT",
      source_label: "Facebook · Comment",
      post_snippet: null,
      post_thumbnail_url: null,
      lead_comment_snippet: null,
      private_reply_status: "not_sent",
      open_post_available: false,
      open_post_href: null,
      fallback_message: "This lead came from a Facebook comment. Post details are not available yet."
    }
  });
  assert.ok(view);
  assert.equal(view?.postDetailsAvailable, false);
  assert.match(view?.fallbackMessage ?? "", /Facebook comment/i);
  assert.equal(view?.postSnippet, null);
});

test("resolveSourcePostContext renders full card when only lead_comment_snippet is present", () => {
  const view = resolveSourcePostContext({
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    has_comment_context: true,
    source_post_context: {
      channel_type: "FACEBOOK",
      source_type: "COMMENT",
      source_label: "Facebook · Comment",
      post_snippet: null,
      post_thumbnail_url: null,
      lead_comment_snippet: "Is this still available?",
      private_reply_status: "not_sent",
      open_post_available: false,
      open_post_href: null,
      fallback_message: "This lead came from a Facebook comment. Post details are not available yet."
    }
  });
  assert.ok(view);
  assert.equal(view?.postDetailsAvailable, true);
  assert.equal(view?.leadComment, "Is this still available?");
  assert.equal(view?.postSnippet, null);
  assert.equal(view?.fallbackMessage, null);
});

test("sanitizeSourcePostText rejects raw provider IDs and URLs", () => {
  assert.equal(sanitizeSourcePostText("1137356672785125"), null);
  assert.equal(sanitizeSourcePostText("https://facebook.com/12345"), null);
  assert.equal(sanitizeSourcePostText("5418_992837465"), null);
  assert.equal(sanitizeSourcePostText("Nice post!"), "Nice post!");
});

test("sourcePostContextViewIsSafe rejects accidental unsafe fields in view model", () => {
  const safe = buildSourcePostContextViewModel({
    kind: "FACEBOOK_COMMENT",
    sourceBadgeLabel: "Facebook · Comment",
    api: {
      postSnippet: "Hello world",
      leadComment: "Interested",
      postDetailsAvailable: true
    },
    privateReplySent: false
  });
  assert.equal(sourcePostContextViewIsSafe(safe), true);

  const unsafe = {
    ...safe,
    postSnippet: "1137356672785125"
  };
  assert.equal(sourcePostContextViewIsSafe(unsafe), false);
});

test("open post href allowed only when safe and openPostAvailable", () => {
  assert.equal(isSafeOpenPostHref("/dashboard/post-context/conv-1"), true);
  assert.equal(isSafeOpenPostHref("https://www.facebook.com/permalink.php"), true);
  assert.equal(isSafeOpenPostHref("1137356672785125"), false);

  const view = buildSourcePostContextViewModel({
    kind: "FACEBOOK_COMMENT",
    sourceBadgeLabel: "Facebook · Comment",
    api: {
      postSnippet: "Post text",
      openPostAvailable: true,
      openPostHref: "https://www.facebook.com/permalink.php",
      postDetailsAvailable: true
    },
    privateReplySent: true
  });
  assert.equal(view.openPostAvailable, true);
  assert.ok(view.openPostHref);

  const hidden = buildSourcePostContextViewModel({
    kind: "FACEBOOK_COMMENT",
    sourceBadgeLabel: "Facebook · Comment",
    api: {
      postSnippet: "Post text",
      openPostAvailable: false,
      openPostHref: "https://www.facebook.com/permalink.php",
      postDetailsAvailable: true
    },
    privateReplySent: false
  });
  assert.equal(hidden.openPostAvailable, false);
});

test("truncateSourcePostText limits long snippets", () => {
  const long = "a".repeat(250);
  const truncated = truncateSourcePostText(long, 180);
  assert.equal(truncated.length, 180);
  assert.match(truncated, /…$/);
});

test("Facebook card changes do not affect Instagram card from separate rows", () => {
  const fb = resolveSourcePostContext({
    channel_type: "FACEBOOK",
    source_type: "COMMENT",
    ...facebookCommentApi
  });
  const ig = resolveSourcePostContext({
    channel_type: "INSTAGRAM",
    source_type: "PRIVATE_REPLY",
    has_private_reply: true,
    ...instagramPrivateReplyApi
  });
  assert.equal(fb?.kind, "FACEBOOK_COMMENT");
  assert.equal(ig?.kind, "INSTAGRAM_PRIVATE_REPLY");
  assert.notEqual(fb?.postThumbnailUrl, ig?.postThumbnailUrl);
});

test("isUnsafeSourcePostContent flags PSID-like content", () => {
  assert.equal(isUnsafeSourcePostContent("Bearer sk_live_abc"), true);
  assert.equal(isUnsafeSourcePostContent("Normal operator text"), false);
});
