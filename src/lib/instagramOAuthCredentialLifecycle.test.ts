import test from "node:test";
import assert from "node:assert/strict";
import {
  assertInstagramOAuthCredentialTransition,
  InstagramOAuthCredentialTransitionError,
  isInstagramOAuthLifecycleOnlyCredentialStatus,
  isInstagramOAuthTokenBearingCredentialStatus
} from "./instagramOAuthCredentialLifecycle.js";

test("allows PENDING to ACTIVE", () => {
  assert.doesNotThrow(() => assertInstagramOAuthCredentialTransition("PENDING", "ACTIVE"));
});

test("allows ACTIVE to TOKEN_EXPIRING and REFRESHING", () => {
  assert.doesNotThrow(() => assertInstagramOAuthCredentialTransition("ACTIVE", "TOKEN_EXPIRING"));
  assert.doesNotThrow(() => assertInstagramOAuthCredentialTransition("TOKEN_EXPIRING", "REFRESHING"));
  assert.doesNotThrow(() => assertInstagramOAuthCredentialTransition("REFRESHING", "ACTIVE"));
});

test("blocks DISCONNECTED back to ACTIVE", () => {
  assert.throws(
    () => assertInstagramOAuthCredentialTransition("DISCONNECTED", "ACTIVE"),
    InstagramOAuthCredentialTransitionError
  );
});

test("blocks REVOKED back to ACTIVE without reconnect", () => {
  assert.throws(
    () => assertInstagramOAuthCredentialTransition("REVOKED", "ACTIVE"),
    InstagramOAuthCredentialTransitionError
  );
});

test("token-bearing status helper includes REAUTH_REQUIRED", () => {
  assert.equal(isInstagramOAuthTokenBearingCredentialStatus("REAUTH_REQUIRED"), true);
  assert.equal(isInstagramOAuthTokenBearingCredentialStatus("PENDING"), false);
});

test("lifecycle-only helper rejects ACTIVE target", () => {
  assert.equal(isInstagramOAuthLifecycleOnlyCredentialStatus("ACTIVE"), false);
  assert.equal(isInstagramOAuthLifecycleOnlyCredentialStatus("TOKEN_EXPIRING"), true);
});

test("allows REVOKED to DISCONNECTED", () => {
  assert.doesNotThrow(() => assertInstagramOAuthCredentialTransition("REVOKED", "DISCONNECTED"));
});
