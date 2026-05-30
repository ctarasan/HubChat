import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RetentionPurgeRunPolicySnapshot,
  RetentionPurgeRunSamplesSnapshot,
  RetentionPurgeRunStatus,
  RetentionPurgeRunSummarySnapshot
} from "../../../lib/retentionPurgeRunSnapshots.js";
import type { RetentionPurgeExecuteResult } from "../../../lib/retentionPurgeExecute.js";

export type RetentionPurgeRunRecord = {
  id: string;
  tenantId: string;
  requestedBy: string | null;
  status: RetentionPurgeRunStatus;
  policySnapshot: RetentionPurgeRunPolicySnapshot;
  summarySnapshot: RetentionPurgeRunSummarySnapshot;
  samplesSnapshot: RetentionPurgeRunSamplesSnapshot | null;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  executionTarget: string | null;
  executionStartedAt: string | null;
  executionFinishedAt: string | null;
  executedBy: string | null;
  executionResult: RetentionPurgeExecuteResult | null;
  executionError: string | null;
};

const PURGE_RUN_SELECT =
  "id,tenant_id,requested_by,status,policy_snapshot,summary_snapshot,samples_snapshot,notes,created_at,cancelled_at,cancelled_by," +
  "execution_target,execution_started_at,execution_finished_at,executed_by,execution_result,execution_error";

function parseStatus(raw: unknown): RetentionPurgeRunStatus {
  const s = String(raw ?? "");
  if (s === "CANCELLED") return "CANCELLED";
  if (s === "EXECUTING") return "EXECUTING";
  if (s === "COMPLETED") return "COMPLETED";
  if (s === "FAILED") return "FAILED";
  return "DRY_RUN_SNAPSHOT";
}

function mapRow(row: Record<string, unknown>): RetentionPurgeRunRecord {
  const executionResultRaw = row.execution_result;
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
    status: parseStatus(row.status),
    policySnapshot: (row.policy_snapshot ?? {}) as RetentionPurgeRunPolicySnapshot,
    summarySnapshot: (row.summary_snapshot ?? {}) as RetentionPurgeRunSummarySnapshot,
    samplesSnapshot:
      row.samples_snapshot && typeof row.samples_snapshot === "object" && !Array.isArray(row.samples_snapshot)
        ? (row.samples_snapshot as RetentionPurgeRunSamplesSnapshot)
        : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancelledBy: typeof row.cancelled_by === "string" ? row.cancelled_by : null,
    executionTarget: typeof row.execution_target === "string" ? row.execution_target : null,
    executionStartedAt: typeof row.execution_started_at === "string" ? row.execution_started_at : null,
    executionFinishedAt: typeof row.execution_finished_at === "string" ? row.execution_finished_at : null,
    executedBy: typeof row.executed_by === "string" ? row.executed_by : null,
    executionResult:
      executionResultRaw && typeof executionResultRaw === "object" && !Array.isArray(executionResultRaw)
        ? (executionResultRaw as RetentionPurgeExecuteResult)
        : null,
    executionError: typeof row.execution_error === "string" ? row.execution_error : null
  };
}

export class SupabaseRetentionPurgeRunRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(input: {
    tenantId: string;
    requestedBy: string | null;
    policySnapshot: RetentionPurgeRunPolicySnapshot;
    summarySnapshot: RetentionPurgeRunSummarySnapshot;
    samplesSnapshot: RetentionPurgeRunSamplesSnapshot;
    notes: string | null;
  }): Promise<RetentionPurgeRunRecord> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .insert({
        tenant_id: input.tenantId,
        requested_by: input.requestedBy,
        status: "DRY_RUN_SNAPSHOT",
        policy_snapshot: input.policySnapshot,
        summary_snapshot: input.summarySnapshot,
        samples_snapshot: input.samplesSnapshot,
        notes: input.notes
      })
      .select(PURGE_RUN_SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }

  async listRecent(input: { tenantId: string; limit: number }): Promise<RetentionPurgeRunRecord[]> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .select(PURGE_RUN_SELECT)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }

  async findById(tenantId: string, id: string): Promise<RetentionPurgeRunRecord | null> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .select(PURGE_RUN_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  }

  async cancel(input: {
    tenantId: string;
    id: string;
    cancelledBy: string | null;
    cancelledAtIso: string;
  }): Promise<RetentionPurgeRunRecord> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .update({
        status: "CANCELLED",
        cancelled_at: input.cancelledAtIso,
        cancelled_by: input.cancelledBy
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .eq("status", "DRY_RUN_SNAPSHOT")
      .select(PURGE_RUN_SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }

  async claimForExecute(input: {
    tenantId: string;
    id: string;
    executedBy: string | null;
    executionTarget: string;
    startedAtIso: string;
  }): Promise<RetentionPurgeRunRecord | null> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .update({
        status: "EXECUTING",
        execution_target: input.executionTarget,
        execution_started_at: input.startedAtIso,
        executed_by: input.executedBy,
        execution_finished_at: null,
        execution_result: null,
        execution_error: null
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .eq("status", "DRY_RUN_SNAPSHOT")
      .select(PURGE_RUN_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  }

  async markExecuteCompleted(input: {
    tenantId: string;
    id: string;
    finishedAtIso: string;
    executionResult: RetentionPurgeExecuteResult;
  }): Promise<RetentionPurgeRunRecord> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .update({
        status: "COMPLETED",
        execution_finished_at: input.finishedAtIso,
        execution_result: input.executionResult,
        execution_error: null
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(PURGE_RUN_SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }

  async markExecuteFailed(input: {
    tenantId: string;
    id: string;
    finishedAtIso: string;
    executionError: string;
    executionResult?: RetentionPurgeExecuteResult | null;
  }): Promise<RetentionPurgeRunRecord> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .update({
        status: "FAILED",
        execution_finished_at: input.finishedAtIso,
        execution_error: input.executionError,
        execution_result: input.executionResult ?? null
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(PURGE_RUN_SELECT)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }
}
