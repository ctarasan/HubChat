import test from "node:test";
import assert from "node:assert/strict";
import { buildRetentionDryRunReport } from "./retentionDryRun.js";
import {
  assertRetentionPurgeRunSnapshotsLean,
  buildRetentionPurgeRunSnapshots
} from "./retentionPurgeRunSnapshots.js";

test("buildRetentionPurgeRunSnapshots stores policy and summary without media URLs", () => {
  const report = buildRetentionDryRunReport({
    tenantId: "tenant-1",
    now: new Date("2026-05-30T12:00:00.000Z"),
    archivedConversations: [
      {
        id: "conv-1",
        leadId: "lead-1",
        channelType: "LINE",
        status: "ARCHIVED",
        resolvedAt: "2025-01-01T00:00:00.000Z",
        closedAt: null,
        updatedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-06-01T00:00:00.000Z"
      }
    ],
    messages: []
  });
  const snapshots = buildRetentionPurgeRunSnapshots(report);
  assert.equal(snapshots.policySnapshot.archivedMediaRetentionDays, 90);
  assert.equal(snapshots.summarySnapshot.estimatedMessagesEligible, 0);
  assert.equal(snapshots.summarySnapshot.generatedAt, report.generatedAt);
  assert.doesNotThrow(() => assertRetentionPurgeRunSnapshotsLean(snapshots));
  const serialized = JSON.stringify(snapshots);
  assert.equal(serialized.includes("media_url"), false);
  assert.equal(serialized.includes("https://"), false);
});

test("assertRetentionPurgeRunSnapshotsLean rejects unsafe snapshot keys", () => {
  assert.throws(() => {
    assertRetentionPurgeRunSnapshotsLean({
      policySnapshot: {},
      summarySnapshot: { generatedAt: "x", access_token: "bad" },
      samplesSnapshot: { mediaPurgeCandidates: [], messagePurgeCandidates: [] }
    });
  });
});
