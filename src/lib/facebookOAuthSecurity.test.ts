import test from "node:test";
import assert from "node:assert/strict";
import {
  generateFacebookOAuthResumeSessionValue,
  generateFacebookOAuthState,
  hashFacebookOAuthSecret,
  isFacebookOAuthTransactionExpired
} from "./facebookOAuthSecurity.js";

test("state and resume session values are unique and hashable", () => {
  const stateA = generateFacebookOAuthState();
  const stateB = generateFacebookOAuthState();
  assert.notEqual(stateA, stateB);
  assert.notEqual(hashFacebookOAuthSecret(stateA), hashFacebookOAuthSecret(stateB));

  const resumeA = generateFacebookOAuthResumeSessionValue();
  const resumeB = generateFacebookOAuthResumeSessionValue();
  assert.notEqual(resumeA, resumeB);
});

test("expired transaction detection respects 15 minute TTL boundary", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const expiresAt = new Date("2026-06-15T12:14:59.000Z");
  assert.equal(isFacebookOAuthTransactionExpired(expiresAt, now), false);
  assert.equal(isFacebookOAuthTransactionExpired(new Date("2026-06-15T12:00:00.000Z"), now), true);
});
