import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdempotencyPort } from "../../../domain/ports.js";

interface SupabaseIdempotencyOptions {
  processingTtlSeconds?: number;
  completedTtlSeconds?: number;
}

export class SupabaseIdempotency implements IdempotencyPort {
  private readonly processingTtlSeconds: number;
  private readonly completedTtlSeconds: number;

  constructor(
    private readonly supabase: SupabaseClient,
    options?: SupabaseIdempotencyOptions
  ) {
    this.processingTtlSeconds = Math.max(60, options?.processingTtlSeconds ?? 300);
    this.completedTtlSeconds = Math.max(300, options?.completedTtlSeconds ?? 86400);
  }

  async hasProcessed(scope: string, key: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("acquire_idempotency_key", {
      p_scope: scope,
      p_key: key,
      p_processing_ttl_seconds: this.processingTtlSeconds
    });
    if (error) throw error;
    return Boolean(data);
  }

  async markProcessed(scope: string, key: string): Promise<void> {
    const { error } = await this.supabase
      .from("idempotency_keys")
      .upsert(
        {
          scope,
          key,
          status: "DONE",
          expires_at: new Date(Date.now() + this.completedTtlSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "scope,key" }
      );
    if (error) throw error;
  }
}
