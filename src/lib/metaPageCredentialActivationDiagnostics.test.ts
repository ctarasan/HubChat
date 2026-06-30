import test from "node:test";
import assert from "node:assert/strict";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import { MetaPageCredentialDecryptionFailedError } from "../domain/metaPageCredentialErrors.js";
import {
  assertMetaPageCredentialActivationFailureLogSafe,
  assertPublicActivationErrorJsonSafe,
  buildMetaPageCredentialActivationFailureLogEvent,
  buildPublicActivationErrorJson,
  createActivationCorrelationId,
  createActivationExecutionState,
  inferMetaPageCredentialActivationStage,
  resolveActivationFailurePersistence,
  sanitizeActivationRef
} from "./metaPageCredentialActivationDiagnostics.js";
import {
  mapMetaPageCredentialActivationFailure,
  MetaPageCredentialActivationApiError,
  safeActivationPublicMessage
} from "./metaPageCredentialActivationApiErrors.js";

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

test("resolveActivationFailurePersistence keeps commitReached false for pre-commit failures", () => {
  const base = createActivationExecutionState();
  const provider = resolveActivationFailurePersistence(
    new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "raw", false),
    base
  );
  assert.deepEqual(provider, { commitReached: false, rpcInvoked: false, postCommitHealthReached: false });

  const encryption = resolveActivationFailurePersistence(new ChannelCredentialEncryptionError("missing"), base);
  assert.deepEqual(encryption, { commitReached: false, rpcInvoked: false, postCommitHealthReached: false });

  const target = resolveActivationFailurePersistence(
    new MetaPageCredentialActivationError("META_CONNECTION_NOT_FOUND", "db missing", false),
    base
  );
  assert.deepEqual(target, { commitReached: false, rpcInvoked: false, postCommitHealthReached: false });
});

test("resolveActivationFailurePersistence marks RPC conflict as rpcInvoked with commitReached false", () => {
  const persistence = resolveActivationFailurePersistence(
    new MetaPageCredentialActivationError("META_ACTIVATION_CONFLICT", "rolled back", false),
    createActivationExecutionState()
  );
  assert.equal(persistence.rpcInvoked, true);
  assert.equal(persistence.commitReached, false);
  assert.equal(persistence.postCommitHealthReached, false);
});

test("resolveActivationFailurePersistence marks post-commit health failure as committed", () => {
  const persistence = resolveActivationFailurePersistence(
    new MetaPageCredentialDecryptionFailedError("decrypt failed"),
    createActivationExecutionState()
  );
  assert.equal(persistence.commitReached, true);
  assert.equal(persistence.rpcInvoked, true);
  assert.equal(persistence.postCommitHealthReached, true);
});

test("resolveActivationFailurePersistence preserves explicit committed execution state", () => {
  const persistence = resolveActivationFailurePersistence(new Error("late failure"), {
    commitReached: true,
    rpcInvoked: true,
    postCommitHealthReached: true
  });
  assert.equal(persistence.commitReached, true);
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

test("buildMetaPageCredentialActivationFailureLogEvent uses explicit commitReached and rpcInvoked", () => {
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
    commitReached: false,
    rpcInvoked: false,
    timestamp: "2026-06-29T00:00:00.000Z"
  });
  assert.equal(event.commitReached, false);
  assert.equal(event.rpcInvoked, false);
  assert.equal(event.stage, "PROVIDER_VERIFICATION");
  const json = JSON.stringify(event);
  assert.equal(json.includes("raw provider body"), false);
  assertMetaPageCredentialActivationFailureLogSafe(event);
});

test("buildPublicActivationErrorJson includes correlationId and omits secrets", () => {
  const mapped = mapMetaPageCredentialActivationFailure(
    new MetaPageCredentialVerificationError("META_PAGE_NOT_ACCESSIBLE", "provider raw", false)
  );
  const body = buildPublicActivationErrorJson(mapped, "corr-public-1");
  assert.equal(body.correlationId, "corr-public-1");
  assert.equal(body.code, "META_PAGE_NOT_ACCESSIBLE");
  assert.equal(body.message, safeActivationPublicMessage("META_PAGE_NOT_ACCESSIBLE"));
  assert.equal(JSON.stringify(body).includes("provider raw"), false);
  assertPublicActivationErrorJsonSafe(body);
});
