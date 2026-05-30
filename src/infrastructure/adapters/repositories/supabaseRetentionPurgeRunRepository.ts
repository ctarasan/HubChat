import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RetentionPurgeRunPolicySnapshot,
  RetentionPurgeRunSamplesSnapshot,
  RetentionPurgeRunStatus,
  RetentionPurgeRunSummarySnapshot
} from "../../../lib/retentionPurgeRunSnapshots.js";

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
};

function mapRow(row: Record<string, unknown>): RetentionPurgeRunRecord {
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
    status: row.status === "CANCELLED" ? "CANCELLED" : "DRY_RUN_SNAPSHOT",
    policySnapshot: (row.policy_snapshot ?? {}) as RetentionPurgeRunPolicySnapshot,
    summarySnapshot: (row.summary_snapshot ?? {}) as RetentionPurgeRunSummarySnapshot,
    samplesSnapshot:
      row.samples_snapshot && typeof row.samples_snapshot === "object" && !Array.isArray(row.samples_snapshot)
        ? (row.samples_snapshot as RetentionPurgeRunSamplesSnapshot)
        : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancelledBy: typeof row.cancelled_by === "string" ? row.cancelled_by : null
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
      .select(
        "id,tenant_id,requested_by,status,policy_snapshot,summary_snapshot,samples_snapshot,notes,created_at,cancelled_at,cancelled_by"
      )
      .single();
    if (error) throw error;
    return mapRow(data as Record<string, unknown>);
  }

  async listRecent(input: { tenantId: string; limit: number }): Promise<RetentionPurgeRunRecord[]> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .select(
        "id,tenant_id,requested_by,status,policy_snapshot,summary_snapshot,samples_snapshot,notes,created_at,cancelled_at,cancelled_by"
      )
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  }

  async findById(tenantId: string, id: string): Promise<RetentionPurgeRunRecord | null> {
    const { data, error } = await this.supabase
      .from("retention_purge_runs")
      .select(
        "id,tenant_id,requested_by,status,policy_snapshot,summary_snapshot,samples_snapshot,notes,created_at,cancelled_at,cancelled_by"
      )
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as Record<string, unknown>) : null;
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
      .select(
        "id,tenant_id,requested_by,status,policy_snapshot,summary_snapshot,samples_snapshot,notes,created_at,cancelled_at,cancelled_by"
      )
      .single();
    if (error) throw error;
    return mapRow(data as Record<string, unknown>);
  }
}
