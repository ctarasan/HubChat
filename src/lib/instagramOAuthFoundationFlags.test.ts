import test from "node:test";
import assert from "node:assert/strict";
import {
  isInstagramOAuthFoundationEnabled,
  isInstagramOAuthRuntimeEnabled
} from "./instagramOAuthFoundationFlags.js";

test("foundation flag defaults OFF when absent", () => {
  assert.equal(isInstagramOAuthFoundationEnabled({}), false);
  assert.equal(isInstagramOAuthFoundationEnabled({ HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "" }), false);
});

test("runtime flag defaults OFF when absent", () => {
  assert.equal(isInstagramOAuthRuntimeEnabled({}), false);
  assert.equal(isInstagramOAuthRuntimeEnabled({ HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "false" }), false);
});

test("flags only enable on explicit true", () => {
  assert.equal(isInstagramOAuthFoundationEnabled({ HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true" }), true);
  assert.equal(isInstagramOAuthRuntimeEnabled({ HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true" }), true);
});
