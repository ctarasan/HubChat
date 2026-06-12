import test from "node:test";
import assert from "node:assert/strict";
import {
  isFacebookPageSelfComment,
  isFacebookPageSelfCommentOnlyWebhookPayload,
  normalizeFacebookProviderId,
  resolveFacebookReceivingPageId
} from "./facebookPageSelfComment.js";

test("normalizeFacebookProviderId trims non-empty strings", () => {
  assert.equal(normalizeFacebookProviderId(" 1137356672785125 "), "1137356672785125");
  assert.equal(normalizeFacebookProviderId(""), null);
  assert.equal(normalizeFacebookProviderId(null), null);
});

test("resolveFacebookReceivingPageId prefers webhook entry.id over configured page id", () => {
  assert.equal(resolveFacebookReceivingPageId("entry-page", "configured-page"), "entry-page");
  assert.equal(resolveFacebookReceivingPageId("", "configured-page"), "configured-page");
});

test("isFacebookPageSelfComment matches stable provider ids only", () => {
  assert.equal(
    isFacebookPageSelfComment({
      commenterId: "1137356672785125",
      receivingPageId: "1137356672785125"
    }),
    true
  );
  assert.equal(
    isFacebookPageSelfComment({
      commenterId: "27244508575134096",
      receivingPageId: "1137356672785125"
    }),
    false
  );
});

test("isFacebookPageSelfComment is fail-open when ids are missing", () => {
  assert.equal(isFacebookPageSelfComment({ commenterId: "1137356672785125", receivingPageId: null }), false);
  assert.equal(isFacebookPageSelfComment({ commenterId: null, receivingPageId: "1137356672785125" }), false);
});

test("isFacebookPageSelfCommentOnlyWebhookPayload is true for page-only self comments", () => {
  const payload = {
    entry: [
      {
        id: "1137356672785125",
        changes: [
          {
            field: "feed",
            value: {
              item: "comment",
              verb: "add",
              from: { id: "1137356672785125", name: "SMARTKORP" },
              post_id: "1137356672785125_122105157068693891",
              comment_id: "122105157068693891_1426457839169799",
              message: "Promotional reply from page"
            }
          }
        ]
      }
    ]
  };
  assert.equal(isFacebookPageSelfCommentOnlyWebhookPayload(payload), true);
});

test("isFacebookPageSelfCommentOnlyWebhookPayload is false when customer comment is present", () => {
  const payload = {
    entry: [
      {
        id: "1137356672785125",
        changes: [
          {
            field: "feed",
            value: {
              item: "comment",
              verb: "add",
              from: { id: "1137356672785125", name: "SMARTKORP" },
              post_id: "1137356672785125_122105157068693891",
              comment_id: "page_reply_1",
              message: "Thanks for your interest"
            }
          },
          {
            field: "feed",
            value: {
              item: "comment",
              verb: "add",
              from: { id: "27244508575134096", name: "Customer" },
              post_id: "1137356672785125_122105157068693891",
              comment_id: "customer_comment_1",
              message: "สนใจ\nขอราคาด้วยค่ะ"
            }
          }
        ]
      }
    ]
  };
  assert.equal(isFacebookPageSelfCommentOnlyWebhookPayload(payload), false);
});
