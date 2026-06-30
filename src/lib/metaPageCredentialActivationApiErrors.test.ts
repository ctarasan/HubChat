import test from "node:test";
import assert from "node:assert/strict";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import {
  mapMetaPageCredentialActivationFailure,
  MetaPageCredentialActivationApiError,
  safeActivationPublicMessage
} from "./metaPageCredentialActivationApiErrors.js";
import { buildPublicActivationErrorJson } from "./metaPageCredentialActivationDiagnostics.js";

const UNSAFE_INTERNAL = "rpc insert failed: relation missing";

test("provider verification failure maps to safe status/code/message", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "Graph API said no", false)
  );
  assert.equal(mapped.httpStatus, 422);
  assert.equal(mapped.code, "META_TOKEN_INVALID");
  assert.equal(mapped.message, "Meta Page access token is invalid");
  const body = buildPublicActivationErrorJson(mapped, "corr-provider-1");
  assert.equal(body.message.includes("Graph API"), false);
});

test("encryption unavailable maps to allowlisted safe message", () => {
  const mapped = mapMetaPageCredentialActivationFailure(new ChannelCredentialEncryptionError("no key"));
  assert.equal(mapped.httpStatus, 503);
  assert.equal(mapped.code, "META_ACTIVATION_FAILED");
  assert.equal(mapped.message, safeActivationPublicMessage("META_ACTIVATION_FAILED"));
});

test("target validation maps to allowlisted safe message", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_CONNECTION_NOT_FOUND", UNSAFE_INTERNAL, false)
  );
  assert.equal(mapped.httpStatus, 400);
  assert.equal(mapped.code, "META_CONNECTION_NOT_FOUND");
  assert.equal(mapped.message, safeActivationPublicMessage("META_CONNECTION_NOT_FOUND"));
  assert.equal(mapped.message.includes("relation missing"), false);
});

test("RPC conflict maps to allowlisted safe message without internal detail", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_ACTIVATION_CONFLICT", UNSAFE_INTERNAL, false)
  );
  assert.equal(mapped.httpStatus, 409);
  assert.equal(mapped.code, "META_ACTIVATION_CONFLICT");
  assert.equal(mapped.message, safeActivationPublicMessage("META_ACTIVATION_CONFLICT"));
  const body = buildPublicActivationErrorJson(mapped, "corr-rpc-1");
  assert.equal(JSON.stringify(body).includes(UNSAFE_INTERNAL), false);
  assert.equal(body.correlationId, "corr-rpc-1");
});

test("malformed internal error maps to generic safe fallback", () => {
  const mapped = mapMetaPageCredentialActivationFailure(new Error("unexpected boom"));
  assert.equal(mapped.httpStatus, 500);
  assert.equal(mapped.code, "META_ACTIVATION_FAILED");
  assert.equal(
    mapped.message,
    "Activation failed. Contact engineering with the correlation reference."
  );
});

test("MetaPageCredentialActivationApiError with unsafe message is sanitized on mapping", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationApiError("META_ACTIVATION_FAILED", UNSAFE_INTERNAL, 500, true)
  );
  assert.equal(mapped.message.includes(UNSAFE_INTERNAL), false);
  const body = buildPublicActivationErrorJson(mapped, "corr-sanitize-1");
  assert.equal(JSON.stringify(body).includes(UNSAFE_INTERNAL), false);
  assert.equal(body.correlationId, "corr-sanitize-1");
});

test("correlation ID can be attached to public JSON without secrets", () => {
  const mapped = new MetaPageCredentialActivationApiError(
    "META_ACTIVATION_INPUT_INVALID",
    "internal invalid detail",
    400,
    false
  );
  const body = buildPublicActivationErrorJson(mapped, "corr-api-1");
  assert.equal(body.correlationId, "corr-api-1");
  assert.equal(body.message, safeActivationPublicMessage("META_ACTIVATION_INPUT_INVALID"));
  assert.equal(JSON.stringify(body).includes("internal invalid detail"), false);
});
