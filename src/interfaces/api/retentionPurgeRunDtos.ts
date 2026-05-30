import { assertRetentionPurgeRunSnapshotsLean } from "../../lib/retentionPurgeRunSnapshots.js";
import type {
  RetentionPurgeRunPolicySnapshot,
  RetentionPurgeRunSamplesSnapshot,
  RetentionPurgeRunStatus,
  RetentionPurgeRunSummarySnapshot
} from "../../lib/retentionPurgeRunSnapshots.js";
import type { RetentionPurgeExecuteResult } from "../../lib/retentionPurgeExecute.js";
import { assertRetentionPurgeExecuteResultLean } from "../../lib/retentionPurgeExecute.js";
import type { RetentionPurgeRunRecord } from "../../infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";

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
  executionTarget: string | null;
  executionStartedAt: string | null;
  executionFinishedAt: string | null;
  executedBy: string | null;
  executionResult: RetentionPurgeExecuteResult | null;
  executionError: string | null;
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
  "cancelledBy",
  "executionTarget",
  "executionStartedAt",
  "executionFinishedAt",
  "executedBy",
  "executionResult",
  "executionError"
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

function parseStatus(row: Record<string, unknown>): RetentionPurgeRunStatus {
  const s = pickString(row, "status") ?? "DRY_RUN_SNAPSHOT";
  if (
    s === "CANCELLED" ||
    s === "EXECUTING" ||
    s === "COMPLETED" ||
    s === "FAILED" ||
    s === "DRY_RUN_SNAPSHOT"
  ) {
    return s;
  }
  return "DRY_RUN_SNAPSHOT";
}

export function retentionPurgeRunRecordToDto(record: RetentionPurgeRunRecord): RetentionPurgeRunListItemDto {
  return toRetentionPurgeRunListItemDto({
    id: record.id,
    status: record.status,
    created_at: record.createdAt,
    requested_by: record.requestedBy,
    policy_snapshot: record.policySnapshot,
    summary_snapshot: record.summarySnapshot,
    samples_snapshot: record.samplesSnapshot,
    notes: record.notes,
    cancelled_at: record.cancelledAt,
    cancelled_by: record.cancelledBy,
    execution_target: record.executionTarget,
    execution_started_at: record.executionStartedAt,
    execution_finished_at: record.executionFinishedAt,
    executed_by: record.executedBy,
    execution_result: record.executionResult,
    execution_error: record.executionError
  });
}

export function toRetentionPurgeRunListItemDto(row: Record<string, unknown>): RetentionPurgeRunListItemDto {
  const policySnapshot = asObject(row.policy_snapshot ?? row.policySnapshot) ?? {};
  const summarySnapshot = asObject(row.summary_snapshot ?? row.summarySnapshot) ?? {};
  const samplesRaw = row.samples_snapshot ?? row.samplesSnapshot;
  const samplesSnapshot =
    samplesRaw && typeof samplesRaw === "object" && !Array.isArray(samplesRaw)
      ? (samplesRaw as RetentionPurgeRunSamplesSnapshot)
      : null;
  const executionResultRaw = row.execution_result ?? row.executionResult;

  const dto: RetentionPurgeRunListItemDto = {
    id: String(row.id ?? ""),
    status: parseStatus(row),
    createdAt: pickIso(row, "created_at", "createdAt") ?? new Date(0).toISOString(),
    requestedBy: pickString(row, "requested_by", "requestedBy"),
    policySnapshot: policySnapshot as RetentionPurgeRunPolicySnapshot,
    summarySnapshot: summarySnapshot as RetentionPurgeRunSummarySnapshot,
    samplesSnapshot,
    notes: pickString(row, "notes"),
    cancelledAt: pickIso(row, "cancelled_at", "cancelledAt"),
    cancelledBy: pickString(row, "cancelled_by", "cancelledBy"),
    executionTarget: pickString(row, "execution_target", "executionTarget"),
    executionStartedAt: pickIso(row, "execution_started_at", "executionStartedAt"),
    executionFinishedAt: pickIso(row, "execution_finished_at", "executionFinishedAt"),
    executedBy: pickString(row, "executed_by", "executedBy"),
    executionResult:
      executionResultRaw && typeof executionResultRaw === "object" && !Array.isArray(executionResultRaw)
        ? (executionResultRaw as RetentionPurgeExecuteResult)
        : null,
    executionError: pickString(row, "execution_error", "executionError")
  };

  assertRetentionPurgeRunListItemDtoLean(dto);
  return dto;
}

export function assertRetentionPurgeRunListItemDtoLean(item: RetentionPurgeRunListItemDto): void {
  assertRetentionPurgeRunSnapshotsLean({
    policySnapshot: item.policySnapshot,
    summarySnapshot: item.summarySnapshot,
    samplesSnapshot: item.samplesSnapshot ?? { mediaPurgeCandidates: [], messagePurgeCandidates: [] }
  });
  if (item.executionResult) {
    assertRetentionPurgeExecuteResultLean(item.executionResult);
  }
  const serialized = JSON.stringify(item).toLowerCase();
  const blocked = ["access_token", "secret_json", "bearer", "jwt", '"content"', "https://", "http://"];
  for (const token of blocked) {
    if (serialized.includes(token)) {
      throw new Error(`Retention purge run list item must not expose ${token}`);
    }
  }
}
