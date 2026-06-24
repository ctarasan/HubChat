import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMetaPageScopePolicy,
  FACEBOOK_REQUIRED_SCOPES,
  INSTAGRAM_REQUIRED_SCOPES,
  normalizeMetaPageGrantedScopes,
  pageTasksSatisfyRequired
} from "./metaPageCredentialScopes.js";
import { facebookOAuthScopes } from "./facebookOAuthConfig.js";

test("FACEBOOK_REQUIRED_SCOPES mirrors facebookOAuthScopes", () => {
  assert.deepEqual([...FACEBOOK_REQUIRED_SCOPES], facebookOAuthScopes());
});

test("normalizeMetaPageGrantedScopes deduplicates and sorts", () => {
  assert.deepEqual(
    normalizeMetaPageGrantedScopes([" Pages_Messaging ", "pages_messaging", ""]),
    ["pages_messaging"]
  );
});

test("Facebook-only required scopes pass", () => {
  const granted = [...FACEBOOK_REQUIRED_SCOPES, "business_management"];
  const result = evaluateMetaPageScopePolicy({
    requestedChannels: ["FACEBOOK"],
    grantedScopes: granted
  });
  assert.equal(result.ok, true);
});

test("Facebook missing required scope fails", () => {
  const result = evaluateMetaPageScopePolicy({
    requestedChannels: ["FACEBOOK"],
    grantedScopes: ["pages_show_list"]
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.channel, "FACEBOOK");
});

test("optional scope absence passes for Facebook-only", () => {
  const result = evaluateMetaPageScopePolicy({
    requestedChannels: ["FACEBOOK"],
    grantedScopes: [...FACEBOOK_REQUIRED_SCOPES]
  });
  assert.equal(result.ok, true);
});

test("dual-channel required scopes pass", () => {
  const result = evaluateMetaPageScopePolicy({
    requestedChannels: ["FACEBOOK", "INSTAGRAM"],
    grantedScopes: [...FACEBOOK_REQUIRED_SCOPES, ...INSTAGRAM_REQUIRED_SCOPES]
  });
  assert.equal(result.ok, true);
});

test("missing Instagram required scope fails dual-channel", () => {
  const result = evaluateMetaPageScopePolicy({
    requestedChannels: ["FACEBOOK", "INSTAGRAM"],
    grantedScopes: [...FACEBOOK_REQUIRED_SCOPES]
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.channel, "INSTAGRAM");
});

test("pageTasksSatisfyRequired requires MESSAGING", () => {
  assert.equal(pageTasksSatisfyRequired(["MESSAGING", "ANALYZE"]), true);
  assert.equal(pageTasksSatisfyRequired(["ANALYZE"]), false);
});
