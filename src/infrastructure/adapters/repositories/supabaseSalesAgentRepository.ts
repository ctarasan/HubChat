import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesAgentRepository } from "../../../domain/ports.js";

export class SupabaseSalesAgentRepository implements SalesAgentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findActiveByIdInTenant(tenantId: string, salesAgentId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("sales_agents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", salesAgentId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }
}
