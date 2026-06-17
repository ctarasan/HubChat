import test from "node:test";
import assert from "node:assert/strict";
import { ChannelConnectRuntimeResolverError } from "../application/channelConnect/channelConnectRuntimeResolver.js";
import { formatErrorForStorage } from "./formatErrorForStorage.js";

test("formatErrorForStorage appends ChannelConnectRuntimeResolverError diagnosticCode", () => {
  const err = new ChannelConnectRuntimeResolverError(
    "FACEBOOK OAuth credentials are unavailable.",
    "credential_decrypt_failed",
    true
  );
  const stored = formatErrorForStorage(err);
  assert.match(stored, /ChannelConnectRuntimeResolverError/);
  assert.match(stored, /FACEBOOK OAuth credentials are unavailable/);
  assert.match(stored, /diagnosticCode=credential_decrypt_failed/);
  assert.equal(stored.includes("EAAG"), false);
});

test("formatErrorForStorage leaves generic errors unchanged aside from stack", () => {
  const err = new Error("boom");
  const stored = formatErrorForStorage(err);
  assert.equal(stored, err.stack);
});
