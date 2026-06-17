import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarketingAutomationBridgeOutboxEnqueueResult,
  MarketingAutomationBridgeOutboxFailureResult,
  MarketingAutomationBridgeOutboxRecord,
  MarketingAutomationBridgeOutboxStatus
} from "../../../domain/marketingAutomationBridgeOutbox.js";
import type { MarketingAutomationBridgeOutboxRepository } from "../../../domain/ports.js";
import type { MarketingAutomationBridgePayload } from "../../../lib/marketingAutomationBridge.js";
import { formatErrorForStorage } from "../../../lib/formatErrorForStorage.js";

function mapRow(row: Record<string, unknown>): MarketingAutomationBridgeOutboxRecord {
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    marketingEventId: String(row.marketing_event_id ?? ""),
    eventType: String(row.event_type ?? ""),
    payloadJson: row.payload_json as MarketingAutomationBridgePayload,
    schemaVersion: String(row.schema_version ?? "1"),
    status: String(row.status ?? "PENDING") as MarketingAutomationBridgeOutboxStatus,
    availableAt: String(row.available_at ?? ""),
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 25),
    lastError: row.last_error == null ? null : String(row.last_error),
    idempotencyKey: String(row.idempotency_key ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    sentAt: row.sent_at == null ? null : String(row.sent_at)
  };
}

export class SupabaseMarketingAutomationBridgeOutboxRepository
  implements MarketingAutomationBridgeOutboxRepository
{
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly processingTimeoutSeconds: number = 120
  ) {}

  async enqueueFromMarketingEvent(input: {
    tenantId: string;
    marketingEventId: string;
    eventType: string;
    schemaVersion: string;
    payloadJson: MarketingAutomationBridgePayload;
    idempotencyKey: string;
  }): Promise<MarketingAutomationBridgeOutboxEnqueueResult> {
    const { data, error } = await this.supabase
      .from("marketing_automation_bridge_outbox")
      .insert({
        tenant_id: input.tenantId,
        marketing_event_id: input.marketingEventId,
        event_type: input.eventType,
        payload_json: input.payloadJson,
        schema_version: input.schemaVersion,
        idempotency_key: input.idempotencyKey
      })
      .select("id");

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        return "duplicate";
      }
      throw error;
    }
    if (!data || data.length === 0) {
      return "duplicate";
    }
    return "enqueued";
  }

  async claimBatch(opts?: {
    limit?: number;
    processingTimeoutSeconds?: number;
  }): Promise<MarketingAutomationBridgeOutboxRecord[]> {
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
    const processingTimeoutSeconds = Math.max(
      1,
      opts?.processingTimeoutSeconds ?? this.processingTimeoutSeconds
    );
    const { data, error } = await this.supabase.rpc("claim_marketing_automation_bridge_outbox", {
      p_limit: limit,
      p_processing_timeout_seconds: processingTimeoutSeconds
    });
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<Record<string, unknown>>;
    return rows.map((row) => mapRow(row));
  }

  async markSent(id: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from("marketing_automation_bridge_outbox")
      .update({
        status: "SENT",
        sent_at: now,
        updated_at: now,
        last_error: null
      })
      .eq("id", id);
    if (error) throw error;
  }

  async markFailed(
    id: string,
    opts: { attemptCount: number; maxAttempts: number; error: unknown }
  ): Promise<MarketingAutomationBridgeOutboxFailureResult> {
    const deadLetter = opts.attemptCount >= opts.maxAttempts;
    const delaySec = Math.min(300, 2 ** Math.max(1, opts.attemptCount));
    const nextAvailableAt = new Date(Date.now() + delaySec * 1000).toISOString();
    const { error } = await this.supabase
      .from("marketing_automation_bridge_outbox")
      .update({
        status: deadLetter ? "DEAD_LETTER" : "PENDING",
        available_at: nextAvailableAt,
        last_error: formatErrorForStorage(opts.error),
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
    if (error) throw error;

    return {
      deadLetter,
      attemptCount: opts.attemptCount,
      nextAvailableAt
    };
  }
}
