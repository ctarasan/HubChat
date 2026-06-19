import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramOAuthOutboundImageEnabled } from "./instagramOAuthOutboundImageFlags.js";
import { isInstagramOAuthOutboundTextEnabled } from "./instagramOAuthOutboundTextFlags.js";

test("outbound image flag defaults OFF", () => {
  assert.equal(isInstagramOAuthOutboundImageEnabled({}), false);
});

test("outbound image requires foundation, runtime, and image flags", () => {
  assert.equal(
    isInstagramOAuthOutboundImageEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true"
    }),
    false
  );
  assert.equal(
    isInstagramOAuthOutboundImageEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "true"
    }),
    true
  );
});

test("text flag does not enable image delivery", () => {
  assert.equal(
    isInstagramOAuthOutboundTextEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
    }),
    true
  );
  assert.equal(
    isInstagramOAuthOutboundImageEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
    }),
    false
  );
});

test("image flag does not enable text delivery", () => {
  assert.equal(
    isInstagramOAuthOutboundImageEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "true"
    }),
    true
  );
  assert.equal(
    isInstagramOAuthOutboundTextEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "true"
    }),
    false
  );
});
