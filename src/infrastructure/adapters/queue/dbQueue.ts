import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueuePort } from "../../../domain/ports.js";

export class DbQueue implements QueuePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueue<T>(topic: string, event: T, opts?: { runAt?: Date; idempotencyKey?: string; tenantId?: string }): Promise<void> {
    const tenantId = opts?.tenantId;
    if (!tenantId) throw new Error("tenantId is required for queue enqueue");

    const { error } = await this.supabase.from("queue_jobs").insert({
      tenant_id: tenantId,
      topic,
      payload_json: event,
      available_at: (opts?.runAt ?? new Date()).toISOString(),
      idempotency_key: opts?.idempotencyKey ?? `${topic}:${Date.now()}`
    });
    if (error) throw error;
  }

  async consume<T>(topic: string, handler: (event: T) => Promise<void>): Promise<void> {
    const { data, error } = await this.supabase.rpc("claim_queue_job", { p_topic: topic });
    if (error) throw error;
    if (!data) return;

    const job = data as {
      id: string;
      payload_json: T;
      retry_count: number;
      max_retries: number;
      tenant_id: string;
    };

    try {
      await handler(job.payload_json);
      await this.supabase.from("queue_jobs").update({ status: "DONE", updated_at: new Date().toISOString() }).eq("id", job.id);
    } catch (err) {
      const retries = job.retry_count + 1;
      const isDead = retries >= job.max_retries;
      const delaySec = Math.min(300, 2 ** retries);
      await this.supabase
        .from("queue_jobs")
        .update({
          status: isDead ? "DEAD_LETTER" : "PENDING",
          retry_count: retries,
          available_at: new Date(Date.now() + delaySec * 1000).toISOString(),
          last_error: String(err),
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      throw err;
    }
  }
}
