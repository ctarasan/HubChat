import test from "node:test";
import assert from "node:assert/strict";
import {
  RETENTION_EXECUTE_CONFIRM_PHRASE,
  RETENTION_EXECUTE_DEFAULT_BATCH_LIMIT,
  RETENTION_EXECUTE_TARGET_RAW_PAYLOADS,
  buildRetentionPurgeRunSnapshotBody,
  buildRetentionRawPayloadExecuteBody,
  canExecuteRawPayloadForRun,
  isRetentionExecuteConfirmValid,
  mapRetentionPurgeRunsFetchError,
  mapRetentionRawPayloadExecuteError,
  parseRetentionPurgeRunCreateResponse,
  parseRetentionPurgeRunsListResponse,
  parseRetentionRawPayloadExecuteResponse,
  sanitizeRetentionAuditNotes
} from "./retentionPurgeRunModel.js";

const samplePolicy = {
  archivedMediaRetentionDays: 90,
  archivedMessageRetentionDays: 365,
  rawPayloadRetentionDays: 30
};

const sampleSummary = {
  mediaPurgeCandidates: 2,
  messageHistoryPurgeCandidates: 4,
  estimatedMessagesEligible: 100,
  estimatedMediaAttachmentsEligible: 10,
  rawPayloadCandidates: 1
};

test("buildRetentionPurgeRunSnapshotBody sends notes only", () => {
  const body = buildRetentionPurgeRunSnapshotBody("  nightly check  ");
  assert.deepEqual(body, { notes: "nightly check" });
  assert.equal("policy" in body, false);
  assert.equal("summary" in body, false);
  assert.equal("samples" in body, false);
  assert.equal("generatedAt" in body, false);
});

test("buildRetentionPurgeRunSnapshotBody blank notes returns empty object", () => {
  assert.deepEqual(buildRetentionPurgeRunSnapshotBody("   "), {});
  assert.deepEqual(buildRetentionPurgeRunSnapshotBody(undefined), {});
  assert.deepEqual(buildRetentionPurgeRunSnapshotBody(""), {});
});

test("parseRetentionPurgeRunsListResponse reads run history", () => {
  const parsed = parseRetentionPurgeRunsListResponse({
    data: [
      {
        id: "run-1",
        status: "DRY_RUN_SNAPSHOT",
        createdAt: "2026-05-29T11:00:00.000Z",
        notes: "baseline",
        policy: samplePolicy,
        summary: sampleSummary
      }
    ]
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.runs.length, 1);
    assert.equal(parsed.runs[0]?.id, "run-1");
    assert.equal(parsed.runs[0]?.notes, "baseline");
    assert.equal(parsed.runs[0]?.summary.mediaPurgeCandidates, 2);
    assert.equal(parsed.meta.rawPayloadExecutionEnabled, true);
  }
});

test("parseRetentionPurgeRunCreateResponse accepts created run", () => {
  const parsed = parseRetentionPurgeRunCreateResponse({
    data: {
      id: "run-2",
      status: "SNAPSHOT_SAVED",
      created_at: "2026-05-29T12:05:00.000Z",
      policy_snapshot: samplePolicy,
      summary_snapshot: sampleSummary
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.run.id, "run-2");
});

test("sanitizeRetentionAuditNotes rejects URLs and tokens", () => {
  assert.equal(sanitizeRetentionAuditNotes("ok note"), "ok note");
  assert.equal(sanitizeRetentionAuditNotes("https://evil.example/x"), null);
  assert.equal(sanitizeRetentionAuditNotes("Bearer abc"), null);
});

test("mapRetentionPurgeRunsFetchError maps 404", () => {
  assert.match(mapRetentionPurgeRunsFetchError(404, null), /not available yet/i);
});

test("buildRetentionRawPayloadExecuteBody uses RAW_PAYLOADS target and batch limit", () => {
  const body = buildRetentionRawPayloadExecuteBody(RETENTION_EXECUTE_CONFIRM_PHRASE);
  assert.equal(body.target, RETENTION_EXECUTE_TARGET_RAW_PAYLOADS);
  assert.equal(body.confirmText, RETENTION_EXECUTE_CONFIRM_PHRASE);
  assert.equal(body.batchLimit, RETENTION_EXECUTE_DEFAULT_BATCH_LIMIT);
});

test("isRetentionExecuteConfirmValid requires exact phrase", () => {
  assert.equal(isRetentionExecuteConfirmValid(RETENTION_EXECUTE_CONFIRM_PHRASE), true);
  assert.equal(isRetentionExecuteConfirmValid("execute retention purge"), false);
  assert.equal(isRetentionExecuteConfirmValid(""), false);
});

test("canExecuteRawPayloadForRun respects feature flag and run status", () => {
  const run = {
    id: "r1",
    status: "DRY_RUN_SNAPSHOT",
    createdAt: "2026-05-29T12:00:00.000Z",
    notes: null,
    policy: samplePolicy,
    summary: sampleSummary
  };
  assert.equal(canExecuteRawPayloadForRun(run, { rawPayloadExecutionEnabled: true }), true);
  assert.equal(canExecuteRawPayloadForRun(run, { rawPayloadExecutionEnabled: false }), false);
  assert.equal(canExecuteRawPayloadForRun({ ...run, status: "COMPLETED" }, { rawPayloadExecutionEnabled: true }), false);
  assert.equal(canExecuteRawPayloadForRun({ ...run, status: "CANCELLED" }, { rawPayloadExecutionEnabled: true }), false);
  assert.equal(canExecuteRawPayloadForRun({ ...run, canExecuteRawPayload: false }, { rawPayloadExecutionEnabled: true }), false);
});

test("parseRetentionRawPayloadExecuteResponse reads safe execution result counts only", () => {
  const parsed = parseRetentionRawPayloadExecuteResponse({
    data: {
      status: "COMPLETED",
      executionResult: { affectedWebhookEvents: 5, affectedMessageRawPayloads: 10 }
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.result.affectedWebhookEvents, 5);
    assert.equal(parsed.result.affectedMessageRawPayloads, 10);
  }
});

test("parseRetentionPurgeRunsListResponse reads execution disabled meta", () => {
  const parsed = parseRetentionPurgeRunsListResponse({
    data: [],
    meta: { rawPayloadExecutionEnabled: false }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.meta.rawPayloadExecutionEnabled, false);
});

test("mapRetentionRawPayloadExecuteError maps 503 feature disabled", () => {
  assert.match(
    mapRetentionRawPayloadExecuteError(503, { error: "Retention purge execute is disabled." }),
    /disabled/i
  );
});
