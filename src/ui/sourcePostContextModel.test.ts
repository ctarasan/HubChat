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
    postThumbnailUrl: "https://cdn.example.com/post-thumb.jpg",
    postSnippet: "Summer sale starts this weekend — comment below for details.",
    leadComment: "Is this still available in size M?",
    privateReplySent: true,
    openPostAvailable: true,
    openPostHref: "https://www.facebook.com/permalink.php?story_fbid=safe",
    postDetailsAvailable: true
  }
};

const instagramPrivateReplyApi = {
  sourcePostContext: {
    postSnippet: "New collection drop — DM us for styling tips.",
    leadComment: "Love this look!",
    privateReplySent: true,
    openPostAvailable: false,
    postDetailsAvailable: true
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
    has_comment_context: true
  });
  assert.ok(view);
  assert.equal(view?.postDetailsAvailable, false);
  assert.match(view?.fallbackMessage ?? "", /Facebook comment/i);
  assert.equal(view?.postSnippet, null);
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
