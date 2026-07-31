import test from "node:test";
import assert from "node:assert/strict";
import { buildFacebookOAuthAuthorizeUrl } from "./facebookGraphOAuth.js";
import { facebookOAuthScopes } from "../../../lib/facebookOAuthConfig.js";

const config = {
  appId: "943662608544465",
  appSecret: "test-secret",
  graphVersion: "v25.0",
  callbackUrl: "https://smartkorp-hub-chat.vercel.app/api/channel-connect/facebook/oauth/callback"
};

test("reauthorize authorize URL includes auth_type=rerequest", () => {
  const url = buildFacebookOAuthAuthorizeUrl({
    config,
    state: "state-token",
    scopes: facebookOAuthScopes(),
    authTypeRerequest: true
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("auth_type"), "rerequest");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(
    parsed.searchParams.get("scope"),
    "pages_show_list,pages_messaging,pages_manage_metadata"
  );
  assert.equal(parsed.searchParams.get("client_id"), config.appId);
  assert.equal(parsed.searchParams.get("redirect_uri"), config.callbackUrl);
  assert.equal(parsed.searchParams.get("state"), "state-token");
  assert.equal(url.includes("access_token"), false);
  assert.equal(url.includes("test-secret"), false);
});

test("initial connect authorize URL omits auth_type by default", () => {
  const url = buildFacebookOAuthAuthorizeUrl({
    config,
    state: "state-token",
    scopes: facebookOAuthScopes()
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("auth_type"), null);
  assert.equal(
    parsed.searchParams.get("scope"),
    "pages_show_list,pages_messaging,pages_manage_metadata"
  );
});

test("scopes do not include Instagram permissions", () => {
  const scopes = facebookOAuthScopes();
  assert.equal(scopes.includes("instagram_basic"), false);
  assert.equal(scopes.includes("instagram_manage_messages"), false);
  assert.deepEqual(scopes, ["pages_show_list", "pages_messaging", "pages_manage_metadata"]);
});
