import type { RetentionDryRunReportDto } from "./retentionDryRun.js";
import { assertRetentionDryRunReportLean } from "./retentionDryRun.js";

export type RetentionPurgeRunStatus = "DRY_RUN_SNAPSHOT" | "CANCELLED";

export type RetentionPurgeRunPolicySnapshot = RetentionDryRunReportDto["policy"];

export type RetentionPurgeRunSummarySnapshot = RetentionDryRunReportDto["summary"] & {
  generatedAt: string;
};

export type RetentionPurgeRunSamplesSnapshot = RetentionDryRunReportDto["samples"];

const BLOCKED_SNAPSHOT_TOKENS = [
  "access_token",
  "secret_json",
  "payload_json",
  "bearer",
  "signedurl",
  "signed_url",
  "jwt",
  '"content"',
  '"media_url"',
  '"preview_url"',
  '"raw_payload"',
  "https://",
  "http://"
] as const;

/** Build safe JSON snapshots from a dry-run report for audit storage. */
export function buildRetentionPurgeRunSnapshots(report: RetentionDryRunReportDto): {
  policySnapshot: RetentionPurgeRunPolicySnapshot;
  summarySnapshot: RetentionPurgeRunSummarySnapshot;
  samplesSnapshot: RetentionPurgeRunSamplesSnapshot;
} {
  assertRetentionDryRunReportLean(report);
  const snapshots = {
    policySnapshot: { ...report.policy },
    summarySnapshot: {
      ...report.summary,
      generatedAt: report.generatedAt
    },
    samplesSnapshot: {
      mediaPurgeCandidates: report.samples.mediaPurgeCandidates.map((row) => ({ ...row })),
      messagePurgeCandidates: report.samples.messagePurgeCandidates.map((row) => ({ ...row }))
    }
  };
  assertRetentionPurgeRunSnapshotsLean(snapshots);
  return snapshots;
}

export function assertRetentionPurgeRunSnapshotsLean(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const token of BLOCKED_SNAPSHOT_TOKENS) {
    if (serialized.includes(token)) {
      throw new Error(`Retention purge run snapshot must not expose ${token}`);
    }
  }
}
