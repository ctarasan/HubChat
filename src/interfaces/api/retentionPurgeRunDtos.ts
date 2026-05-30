import { assertRetentionPurgeRunSnapshotsLean } from "../../lib/retentionPurgeRunSnapshots.js";
import type {
  RetentionPurgeRunPolicySnapshot,
  RetentionPurgeRunSamplesSnapshot,
  RetentionPurgeRunStatus,
  RetentionPurgeRunSummarySnapshot
} from "../../lib/retentionPurgeRunSnapshots.js";

export type RetentionPurgeRunListItemDto = {
  id: string;
  status: RetentionPurgeRunStatus;
  createdAt: string;
  requestedBy: string | null;
  policySnapshot: RetentionPurgeRunPolicySnapshot;
  summarySnapshot: RetentionPurgeRunSummarySnapshot;
  samplesSnapshot: RetentionPurgeRunSamplesSnapshot | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
};

export const RETENTION_PURGE_RUN_LIST_ITEM_DTO_KEYS = [
  "id",
  "status",
  "createdAt",
  "requestedBy",
  "policySnapshot",
  "summarySnapshot",
  "samplesSnapshot",
  "notes",
  "cancelledAt",
  "cancelledBy"
] as const;

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickIso(row: Record<string, unknown>, ...keys: string[]): string | null {
  const s = pickString(row, ...keys);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toRetentionPurgeRunListItemDto(row: Record<string, unknown>): RetentionPurgeRunListItemDto {
  const statusRaw = pickString(row, "status") ?? "DRY_RUN_SNAPSHOT";
  const status = (statusRaw === "CANCELLED" ? "CANCELLED" : "DRY_RUN_SNAPSHOT") as RetentionPurgeRunStatus;
  const policySnapshot = asObject(row.policy_snapshot ?? row.policySnapshot) ?? {};
  const summarySnapshot = asObject(row.summary_snapshot ?? row.summarySnapshot) ?? {};
  const samplesRaw = row.samples_snapshot ?? row.samplesSnapshot;
  const samplesSnapshot =
    samplesRaw && typeof samplesRaw === "object" && !Array.isArray(samplesRaw)
      ? (samplesRaw as RetentionPurgeRunSamplesSnapshot)
      : null;

  const dto: RetentionPurgeRunListItemDto = {
    id: String(row.id ?? ""),
    status,
    createdAt: pickIso(row, "created_at", "createdAt") ?? new Date(0).toISOString(),
    requestedBy: pickString(row, "requested_by", "requestedBy"),
    policySnapshot: policySnapshot as RetentionPurgeRunPolicySnapshot,
    summarySnapshot: summarySnapshot as RetentionPurgeRunSummarySnapshot,
    samplesSnapshot,
    notes: pickString(row, "notes"),
    cancelledAt: pickIso(row, "cancelled_at", "cancelledAt"),
    cancelledBy: pickString(row, "cancelled_by", "cancelledBy")
  };

  assertRetentionPurgeRunSnapshotsLean({
    policySnapshot: dto.policySnapshot,
    summarySnapshot: dto.summarySnapshot,
    samplesSnapshot: dto.samplesSnapshot ?? { mediaPurgeCandidates: [], messagePurgeCandidates: [] }
  });

  return dto;
}

export function assertRetentionPurgeRunListItemDtoLean(item: RetentionPurgeRunListItemDto): void {
  assertRetentionPurgeRunSnapshotsLean({
    policySnapshot: item.policySnapshot,
    summarySnapshot: item.summarySnapshot,
    samplesSnapshot: item.samplesSnapshot ?? { mediaPurgeCandidates: [], messagePurgeCandidates: [] }
  });
  const serialized = JSON.stringify(item).toLowerCase();
  const blocked = ["access_token", "secret_json", "bearer", "jwt", '"content"'];
  for (const token of blocked) {
    if (serialized.includes(token)) {
      throw new Error(`Retention purge run list item must not expose ${token}`);
    }
  }
}
