import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramOAuthOutboundTextEnabled } from "./instagramOAuthOutboundTextFlags.js";

test("outbound text flag defaults OFF", () => {
  assert.equal(isInstagramOAuthOutboundTextEnabled({}), false);
});

test("outbound text requires foundation, runtime, and outbound text flags", () => {
  assert.equal(
    isInstagramOAuthOutboundTextEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true"
    }),
    false
  );
  assert.equal(
    isInstagramOAuthOutboundTextEnabled({
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
    }),
    true
  );
});
