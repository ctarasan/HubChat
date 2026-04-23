import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutboxClaimedEvent, OutboxFailureResult, OutboxPort } from "../../../domain/ports.js";

export class SupabaseOutboxRepository implements OutboxPort {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly processingTimeoutSeconds: number = 120
  ) {}

  async add<T>(input: { tenantId: string; topic: string; payload: T; idempotencyKey: string; availableAt?: Date }): Promise<void> {
    const { error } = await this.supabase.from("outbox_events").insert({
      tenant_id: input.tenantId,
      topic: input.topic,
      payload_json: input.payload,
      idempotency_key: input.idempotencyKey,
      available_at: (input.availableAt ?? new Date()).toISOString()
    });
    if (error) throw error;
  }

  async claimBatch<T>(opts?: { limit?: number; topic?: string }): Promise<Array<OutboxClaimedEvent<T>>> {
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));
    const { data, error } = await this.supabase.rpc("claim_outbox_events", {
      p_topic: opts?.topic ?? null,
      p_limit: limit,
      p_processing_timeout_seconds: this.processingTimeoutSeconds
    });
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
      id: string;
      tenant_id: string;
      topic: string;
      payload_json: T;
      idempotency_key: string;
      attempt_count: number;
      max_attempts: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      topic: row.topic,
      payload: row.payload_json,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts
    }));
  }

  async markDispatched(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from("outbox_events")
      .update({ status: "DISPATCHED", dispatched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw error;
  }

  async markFailed(
    eventId: string,
    opts: { attemptCount: number; maxAttempts: number; error: unknown }
  ): Promise<OutboxFailureResult> {
    const deadLetter = opts.attemptCount >= opts.maxAttempts;
    const delaySec = Math.min(300, 2 ** Math.max(1, opts.attemptCount));
    const nextAvailableAt = new Date(Date.now() + delaySec * 1000).toISOString();
    const { error } = await this.supabase
      .from("outbox_events")
      .update({
        status: deadLetter ? "DEAD_LETTER" : "PENDING",
        available_at: nextAvailableAt,
        last_error: String(opts.error),
        updated_at: new Date().toISOString()
      })
      .eq("id", eventId);
    if (error) throw error;

    return {
      deadLetter,
      attemptCount: opts.attemptCount,
      nextAvailableAt
    };
  }
}
