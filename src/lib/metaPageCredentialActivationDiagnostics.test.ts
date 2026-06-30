import test from "node:test";
import assert from "node:assert/strict";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import {
  assertMetaPageCredentialActivationFailureLogSafe,
  assertPublicActivationErrorJsonSafe,
  buildMetaPageCredentialActivationFailureLogEvent,
  buildPublicActivationErrorJson,
  createActivationCorrelationId,
  inferMetaPageCredentialActivationStage,
  isActivationCommitReached,
  sanitizeActivationRef
} from "./metaPageCredentialActivationDiagnostics.js";
import { mapMetaPageCredentialActivationFailure } from "./metaPageCredentialActivationApiErrors.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";

test("createActivationCorrelationId uses injected UUID per call", () => {
  let calls = 0;
  const id1 = createActivationCorrelationId(() => {
    calls += 1;
    return "corr-aaaa-1111";
  });
  const id2 = createActivationCorrelationId(() => {
    calls += 1;
    return "corr-bbbb-2222";
  });
  assert.equal(id1, "corr-aaaa-1111");
  assert.equal(id2, "corr-bbbb-2222");
  assert.equal(calls, 2);
});

test("sanitizeActivationRef truncates long identifiers", () => {
  assert.equal(sanitizeActivationRef(TENANT), "ba82…865f");
  assert.equal(sanitizeActivationRef("short"), "short");
  assert.equal(sanitizeActivationRef(null), null);
});

test("inferMetaPageCredentialActivationStage maps failure families", () => {
  const provider = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "raw provider detail", false)
  );
  assert.equal(
    inferMetaPageCredentialActivationStage(
      new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "raw provider detail", false),
      provider
    ),
    "PROVIDER_VERIFICATION"
  );

  const encryption = mapMetaPageCredentialActivationFailure(new ChannelCredentialEncryptionError("missing key"));
  assert.equal(
    inferMetaPageCredentialActivationStage(new ChannelCredentialEncryptionError("missing key"), encryption),
    "ENCRYPTION_PRECHECK"
  );

  const target = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_CONNECTION_NOT_FOUND", "missing", false)
  );
  assert.equal(
    inferMetaPageCredentialActivationStage(
      new MetaPageCredentialActivationError("META_CONNECTION_NOT_FOUND", "missing", false),
      target
    ),
    "TARGET_VALIDATION"
  );

  const rpc = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialActivationError("META_ACTIVATION_CONFLICT", "rpc failed", false)
  );
  assert.equal(
    inferMetaPageCredentialActivationStage(
      new MetaPageCredentialActivationError("META_ACTIVATION_CONFLICT", "rpc failed", false),
      rpc
    ),
    "ACTIVATION_RPC"
  );

  const route = mapMetaPageCredentialActivationFailure(
    Object.assign(new Error("bad input"), { name: "MetaPageCredentialActivationApiError" })
  );
  assert.equal(inferMetaPageCredentialActivationStage(new Error("Unauthorized"), route), "AUTHORIZATION");
});

test("isActivationCommitReached is false for pre-commit stages", () => {
  assert.equal(isActivationCommitReached("PROVIDER_VERIFICATION"), false);
  assert.equal(isActivationCommitReached("ENCRYPTION_PRECHECK"), false);
  assert.equal(isActivationCommitReached("ACTIVATION_RPC"), true);
  assert.equal(isActivationCommitReached("POST_COMMIT_HEALTH"), true);
});

test("buildMetaPageCredentialActivationFailureLogEvent omits secrets", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "raw provider body", false)
  );
  const event = buildMetaPageCredentialActivationFailureLogEvent({
    correlationId: "corr-log-1",
    stage: "PROVIDER_VERIFICATION",
    sanitizedCode: mapped.code,
    httpStatus: mapped.httpStatus,
    context: {
      tenantId: TENANT,
      facebookConnectionId: CONNECTION,
      requestedChannels: ["FACEBOOK"],
      expectedCredentialVersion: 0
    },
    timestamp: "2026-06-29T00:00:00.000Z"
  });
  assert.equal(event.commitReached, false);
  assert.equal(event.stage, "PROVIDER_VERIFICATION");
  assert.equal(event.sanitizedCode, "META_TOKEN_INVALID");
  const json = JSON.stringify(event);
  assert.equal(json.includes("accessToken"), false);
  assert.equal(json.includes("Authorization"), false);
  assert.equal(json.includes("Bearer "), false);
  assert.equal(json.includes("raw provider body"), false);
  assert.equal(json.includes("EAA"), false);
  assertMetaPageCredentialActivationFailureLogSafe(event);
});

test("buildPublicActivationErrorJson includes correlationId and omits secrets", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialVerificationError("META_PAGE_NOT_ACCESSIBLE", "provider raw", false)
  );
  const body = buildPublicActivationErrorJson(mapped, "corr-public-1");
  assert.equal(body.correlationId, "corr-public-1");
  assert.equal(body.code, "META_PAGE_NOT_ACCESSIBLE");
  assert.equal(body.message, mapped.message);
  assert.equal(body.error, mapped.message);
  assert.equal(JSON.stringify(body).includes("provider raw"), false);
  assertPublicActivationErrorJsonSafe(body);
});
