import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramOAuthTestConnectionEnabled } from "./instagramOAuthTestConnectionFlags.js";

test("test connection flag defaults OFF", () => {
  assert.equal(isInstagramOAuthTestConnectionEnabled({}), false);
  assert.equal(isInstagramOAuthTestConnectionEnabled({ HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "" }), false);
  assert.equal(isInstagramOAuthTestConnectionEnabled({ HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "false" }), false);
});

test("test connection flag enables only explicit truthy values", () => {
  assert.equal(isInstagramOAuthTestConnectionEnabled({ HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "true" }), true);
});
