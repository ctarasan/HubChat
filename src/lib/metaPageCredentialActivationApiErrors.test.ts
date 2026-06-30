import test from "node:test";
import assert from "node:assert/strict";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import {
  mapMetaPageCredentialActivationFailure,
  MetaPageCredentialActivationApiError
} from "./metaPageCredentialActivationApiErrors.js";
import { buildPublicActivationErrorJson } from "./metaPageCredentialActivationDiagnostics.js";

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

test("encryption unavailable maps to distinct safe code", () => {
  const mapped = mapMetaPageCredentialActivationFailure(new ChannelCredentialEncryptionError("no key"));
  assert.equal(mapped.httpStatus, 503);
  assert.equal(mapped.code, "META_ACTIVATION_FAILED");
  assert.equal(mapped.message, "Credential encryption is unavailable");
});

test("target validation maps to distinct safe code", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_CONNECTION_NOT_FOUND", "db missing", false)
  );
  assert.equal(mapped.httpStatus, 400);
  assert.equal(mapped.code, "META_CONNECTION_NOT_FOUND");
});

test("RPC failure maps to distinct safe code", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_ACTIVATION_CONFLICT", "rpc insert failed", false)
  );
  assert.equal(mapped.httpStatus, 409);
  assert.equal(mapped.code, "META_ACTIVATION_CONFLICT");
});

test("malformed internal error maps to generic safe fallback", () => {
  const mapped = mapMetaPageCredentialActivationFailure(new Error("unexpected boom"));
  assert.equal(mapped.httpStatus, 500);
  assert.equal(mapped.code, "META_ACTIVATION_FAILED");
  assert.equal(mapped.message, "Meta Page credential activation failed");
});

test("correlation ID can be attached to public JSON without secrets", () => {
  const mapped = new MetaPageCredentialActivationApiError(
    "META_ACTIVATION_INPUT_INVALID",
    "Activation request was invalid",
    400,
    false
  );
  const body = buildPublicActivationErrorJson(mapped, "corr-api-1");
  assert.equal(body.correlationId, "corr-api-1");
  assert.equal(JSON.stringify(body).includes("accessToken"), false);
});
