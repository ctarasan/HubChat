import test from "node:test";
import assert from "node:assert/strict";
import { isInstagramOAuthConnectEnabled } from "./instagramOAuthConnectFlags.js";

test("connect flag defaults OFF", () => {
  assert.equal(isInstagramOAuthConnectEnabled({}), false);
  assert.equal(isInstagramOAuthConnectEnabled({ HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "" }), false);
  assert.equal(isInstagramOAuthConnectEnabled({ HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "false" }), false);
  assert.equal(isInstagramOAuthConnectEnabled({ HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "maybe" }), false);
});

test("connect flag enables only explicit truthy values", () => {
  assert.equal(isInstagramOAuthConnectEnabled({ HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "true" }), true);
  assert.equal(isInstagramOAuthConnectEnabled({ HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED: "1" }), true);
});
