import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_POST_TEXT_METADATA_KEYS,
  extractSourcePostTextFromMetadata
} from "./sourcePostTextFromMetadata.js";

test("extractSourcePostTextFromMetadata reads allowlisted post caption keys", () => {
  assert.equal(
    extractSourcePostTextFromMetadata({ post_caption: "Summer sale starts this weekend." }),
    "Summer sale starts this weekend."
  );
  assert.equal(
    extractSourcePostTextFromMetadata({ source_post_message: "New drop is live." }),
    "New drop is live."
  );
});

test("extractSourcePostTextFromMetadata rejects URLs provider IDs JSON and tokens", () => {
  assert.equal(extractSourcePostTextFromMetadata({ post_message: "https://facebook.com/post/1" }), null);
  assert.equal(extractSourcePostTextFromMetadata({ post_message: "1137356672785125" }), null);
  assert.equal(extractSourcePostTextFromMetadata({ post_message: "5418_992837465" }), null);
  assert.equal(extractSourcePostTextFromMetadata({ post_message: '{"message":"secret"}' }), null);
  assert.equal(extractSourcePostTextFromMetadata({ post_message: "Bearer EAAG1234567890abcdef" }), null);
});

test("extractSourcePostTextFromMetadata ignores blocked raw payload keys", () => {
  assert.equal(
    extractSourcePostTextFromMetadata({
      rawPayload: { message: "Should not leak" },
      graphCommentDetail: { message: "Also blocked" }
    }),
    null
  );
  assert.equal(
    extractSourcePostTextFromMetadata({
      permalinkUrl: "https://www.facebook.com/permalink.php?story_fbid=1",
      post_snippet: "Safe caption text"
    }),
    "Safe caption text"
  );
});

test("allowlist includes expected metadata keys", () => {
  assert.equal(SOURCE_POST_TEXT_METADATA_KEYS.includes("post_caption"), true);
  assert.equal(SOURCE_POST_TEXT_METADATA_KEYS.includes("source_post_snippet"), true);
});
