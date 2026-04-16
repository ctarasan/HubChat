import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelType } from "../../../domain/entities.js";
import type { ChannelAccountRepository } from "../../../domain/ports.js";

export class SupabaseChannelAccountRepository implements ChannelAccountRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByTenantAndChannel(tenantId: string, channel: ChannelType): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from("channel_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? { id: data.id } : null;
  }
}
