import type { SupabaseClient } from "@supabase/supabase-js";
import { toIsoTimestamp } from "../../../domain/dateUtils.js";
import type { QueueClaimedJob, QueueFailureResult, QueuePort, QueueRetryJobRef } from "../../../domain/ports.js";

function formatErrorForStorage(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class DbQueue implements QueuePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueue<T>(topic: string, event: T, opts?: { runAt?: Date; idempotencyKey?: string; tenantId?: string }): Promise<void> {
    const tenantId = opts?.tenantId;
    if (!tenantId) throw new Error("tenantId is required for queue enqueue");

    const { error } = await this.supabase.from("queue_jobs").insert({
      tenant_id: tenantId,
      topic,
      payload_json: event,
      available_at: toIsoTimestamp(opts?.runAt ?? new Date()),
      idempotency_key: opts?.idempotencyKey ?? `${topic}:${Date.now()}`
    });
    if (error) throw error;
  }

  async claimBatch<T>(topic: string, opts?: { limit?: number }): Promise<Array<QueueClaimedJob<T>>> {
    const limit = Math.max(1, Math.min(200, opts?.limit ?? 1));
    const { data, error } = await this.supabase.rpc("claim_queue_jobs", { p_topic: topic, p_limit: limit });
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
      id: string;
      payload_json: T;
      retry_count: number;
      max_retries: number;
      tenant_id: string;
    }>;
    return rows
      .filter((job) => Boolean(job?.id))
      .map((job) => ({
        id: job.id,
        tenantId: job.tenant_id,
        payload: job.payload_json,
        retryCount: job.retry_count,
        maxRetries: job.max_retries
      }));
  }

  async markDone(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from("queue_jobs")
      .update({ status: "DONE", updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) throw error;
  }

  async markFailed(job: QueueRetryJobRef, error: unknown): Promise<QueueFailureResult> {
    const retries = job.retryCount + 1;
    const deadLetter = retries >= job.maxRetries;
    const delaySec = Math.min(300, 2 ** retries);
    const nextAvailableAt = new Date(Date.now() + delaySec * 1000).toISOString();

    const { error: updateError } = await this.supabase
      .from("queue_jobs")
      .update({
        status: deadLetter ? "DEAD_LETTER" : "PENDING",
        retry_count: retries,
        available_at: nextAvailableAt,
        last_error: formatErrorForStorage(error),
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);
    if (updateError) throw updateError;

    return {
      deadLetter,
      retryCount: retries,
      nextAvailableAt
    };
  }

  async consume<T>(topic: string, handler: (event: T) => Promise<void>): Promise<void> {
    const job = (await this.claimBatch<T>(topic, { limit: 1 }))[0];
    if (!job) return;
    try {
      await handler(job.payload);
      await this.markDone(job.id);
    } catch (error) {
      await this.markFailed(job, error);
      throw error;
    }
  }
}
