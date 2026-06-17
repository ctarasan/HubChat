import test from "node:test";
import assert from "node:assert/strict";
import { ChannelConnectRuntimeResolverError } from "../application/channelConnect/channelConnectRuntimeResolver.js";
import { loggableError, serializeError } from "./logError.js";

test("serializeError serializes Postgrest-style objects", () => {
  const out = serializeError({ message: "RPC failed", code: "42883", details: "hint here" });
  assert.equal(out.message, "RPC failed");
  assert.equal(out.code, "42883");
});

test("serializeError passes through Error", () => {
  const out = serializeError(new Error("boom"));
  assert.equal(out.message, "boom");
});

test("serializeError preserves ChannelConnectRuntimeResolverError diagnosticCode", () => {
  const err = new ChannelConnectRuntimeResolverError(
    "FACEBOOK OAuth credentials are unavailable.",
    "encryption_key_missing",
    true
  );
  const out = serializeError(err);
  assert.equal(out.code, "encryption_key_missing");
  assert.equal(out.message.includes("encryption"), false);
});

test("loggableError matches serializeError for the same thrown value", () => {
  const err = new Error("x");
  const a = serializeError(err);
  const b = loggableError(err);
  assert.deepEqual(a, b);
});
