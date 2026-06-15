import test from "node:test";
import assert from "node:assert/strict";
import {
  assertChannelConnectionStatusTransition,
  assertPublicConnectionKey,
  canTransitionChannelConnectionStatus,
  generatePublicConnectionKey,
  normalizeChannelConnectProvider,
  resolveCredentialStateFromExpiry
} from "./channelConnectionLifecycle.js";

test("generatePublicConnectionKey is safe for URLs", () => {
  const key = generatePublicConnectionKey();
  assert.match(key, /^ccp_[A-Za-z0-9_-]{16,128}$/);
  assert.equal(assertPublicConnectionKey(key), key);
});

test("normalizeChannelConnectProvider accepts known providers", () => {
  assert.equal(normalizeChannelConnectProvider("line"), "LINE");
  assert.throws(() => normalizeChannelConnectProvider("SMS"), /Invalid channel connect provider/);
});

test("controlled lifecycle transitions allow happy path", () => {
  assert.equal(canTransitionChannelConnectionStatus("DRAFT", "AUTHORIZING"), true);
  assert.equal(canTransitionChannelConnectionStatus("AUTHORIZING", "CONNECTED"), true);
  assert.equal(canTransitionChannelConnectionStatus("AUTHORIZING", "READY"), true);
  assert.equal(canTransitionChannelConnectionStatus("OUTBOUND_VERIFIED", "READY"), true);
  assert.doesNotThrow(() => assertChannelConnectionStatusTransition("AUTHORIZING", "READY"));
  assert.doesNotThrow(() => assertChannelConnectionStatusTransition("DRAFT", "AUTHORIZING"));
});

test("lifecycle blocks invalid jump", () => {
  assert.equal(canTransitionChannelConnectionStatus("DRAFT", "READY"), false);
  assert.throws(() => assertChannelConnectionStatusTransition("DRAFT", "READY"), /Invalid channel connection status transition/);
});

test("resolveCredentialStateFromExpiry marks expired tokens", () => {
  const state = resolveCredentialStateFromExpiry({
    credentialState: "SET",
    tokenExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  assert.equal(state, "EXPIRED");
});
