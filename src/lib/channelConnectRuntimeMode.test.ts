import test from "node:test";
import assert from "node:assert/strict";
import {
  isChannelConnectResolverEnabled,
  parseChannelConnectRuntimeMode,
  parseChannelConnectRuntimeModeFromEnv,
  shouldAttemptChannelConnectDb
} from "./channelConnectRuntimeMode.js";

test("parseChannelConnectRuntimeMode unknown values default to ENV_ONLY per provider", () => {
  assert.equal(parseChannelConnectRuntimeMode("LINE", "NOT_A_MODE"), "ENV_ONLY");
  assert.equal(parseChannelConnectRuntimeMode("FACEBOOK", "legacy"), "ENV_ONLY");
  assert.equal(parseChannelConnectRuntimeMode("INSTAGRAM", ""), "ENV_ONLY");
});

test("parseChannelConnectRuntimeModeFromEnv falls back to ENV_ONLY when unset", () => {
  assert.equal(parseChannelConnectRuntimeModeFromEnv("LINE", {}), "ENV_ONLY");
  assert.equal(parseChannelConnectRuntimeModeFromEnv("FACEBOOK", {}), "ENV_ONLY");
  assert.equal(parseChannelConnectRuntimeModeFromEnv("INSTAGRAM", {}), "ENV_ONLY");
});

test("shouldAttemptChannelConnectDb is false for ENV_ONLY even when resolver enabled", () => {
  assert.equal(shouldAttemptChannelConnectDb("ENV_ONLY", true), false);
});

test("isChannelConnectResolverEnabled treats non-true as disabled", () => {
  assert.equal(isChannelConnectResolverEnabled({ HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED: "1" }), false);
  assert.equal(isChannelConnectResolverEnabled({ HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED: "TRUE" }), false);
});
