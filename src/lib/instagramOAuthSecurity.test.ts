import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_OAUTH_STATE_BYTES,
  buildInstagramOAuthStateExpiresAt,
  generateInstagramOAuthState,
  hashInstagramOAuthState,
  isInstagramOAuthStateExpired
} from "./instagramOAuthSecurity.js";

test("generateInstagramOAuthState uses base64url with sufficient entropy", () => {
  const state = generateInstagramOAuthState();
  assert.match(state, /^[A-Za-z0-9_-]+$/);
  assert.ok(state.length >= 32);
});

test("hashInstagramOAuthState is deterministic and not reversible", () => {
  const state = generateInstagramOAuthState();
  const hash1 = hashInstagramOAuthState(state);
  const hash2 = hashInstagramOAuthState(state);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, state);
  assert.equal(hash1.length, 64);
});

test("state TTL defaults to 10 minutes", () => {
  const now = new Date("2026-06-20T10:00:00.000Z");
  const expiresAt = buildInstagramOAuthStateExpiresAt(now);
  assert.equal(expiresAt.toISOString(), "2026-06-20T10:10:00.000Z");
});

test("isInstagramOAuthStateExpired respects boundary", () => {
  const expiresAt = new Date("2026-06-20T10:10:00.000Z");
  assert.equal(isInstagramOAuthStateExpired(expiresAt, new Date("2026-06-20T10:10:00.000Z")), true);
  assert.equal(isInstagramOAuthStateExpired(expiresAt, new Date("2026-06-20T10:09:59.999Z")), false);
});

test("state byte constant is at least 256 bits", () => {
  assert.ok(INSTAGRAM_OAUTH_STATE_BYTES * 8 >= 256);
});
