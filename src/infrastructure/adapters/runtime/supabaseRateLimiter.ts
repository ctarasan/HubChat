import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelType } from "../../../domain/entities.js";
import type { RateLimiterPort } from "../../../domain/ports.js";

interface SupabaseRateLimiterOptions {
  requestsPerWindow?: number;
  windowSeconds?: number;
}

export class SupabaseRateLimiter implements RateLimiterPort {
  private readonly requestsPerWindow: number;
  private readonly windowSeconds: number;

  constructor(
    private readonly supabase: SupabaseClient,
    options?: SupabaseRateLimiterOptions
  ) {
    this.requestsPerWindow = Math.max(1, options?.requestsPerWindow ?? 120);
    this.windowSeconds = Math.max(1, options?.windowSeconds ?? 60);
  }

  async checkOrThrow(tenantId: string, channel: ChannelType): Promise<void> {
    const { data, error } = await this.supabase.rpc("check_rate_limit", {
      p_tenant_id: tenantId,
      p_channel: channel,
      p_limit: this.requestsPerWindow,
      p_window_seconds: this.windowSeconds
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const allowed = Boolean(row?.allowed);
    if (allowed) return;

    const resetAt = row?.reset_at ? String(row.reset_at) : undefined;
    const currentCount = Number(row?.current_count ?? this.requestsPerWindow + 1);
    const suffix = resetAt ? `; resetAt=${resetAt}` : "";
    throw new Error(
      `Rate limit exceeded for tenant=${tenantId} channel=${channel} count=${currentCount} limit=${this.requestsPerWindow}${suffix}`
    );
  }
}
