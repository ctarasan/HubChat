import test from "node:test";
import assert from "node:assert/strict";
import {
  mapRpcMessageToMetaPageCredentialActivationError,
  MetaPageCredentialActivationError
} from "./metaPageCredentialActivationErrors.js";

test("activation error exposes stable public JSON without secrets", () => {
  const err = new MetaPageCredentialActivationError(
    "META_ACTIVATION_CONFLICT",
    "Meta Page credential activation conflict",
    false
  );
  const json = JSON.stringify(err.toPublicJson());
  assert.equal(json.includes("secret"), false);
  assert.equal(json.includes("ciphertext"), false);
});

test("mapRpcMessageToMetaPageCredentialActivationError recognizes stable codes", () => {
  const mapped = mapRpcMessageToMetaPageCredentialActivationError("META_CREDENTIAL_VERSION_CONFLICT");
  assert.ok(mapped);
  assert.equal(mapped?.code, "META_CREDENTIAL_VERSION_CONFLICT");
  assert.equal(mapped?.retryable, false);
});

test("mapRpcMessageToMetaPageCredentialActivationError returns null for unknown messages", () => {
  assert.equal(
    mapRpcMessageToMetaPageCredentialActivationError("unexpected postgres failure"),
    null
  );
});
