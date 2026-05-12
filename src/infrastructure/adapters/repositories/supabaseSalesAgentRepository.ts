import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesAgentListItem, SalesAgentRepository } from "../../../domain/ports.js";

export class SupabaseSalesAgentRepository implements SalesAgentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listActiveByTenant(tenantId: string): Promise<SalesAgentListItem[]> {
    const { data, error } = await this.supabase
      .from("sales_agents")
      .select("id,email,name,role,status")
      .eq("tenant_id", tenantId)
      .eq("status", "ACTIVE")
      .order("name", { ascending: true })
      .order("email", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    return rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name ?? ""),
      role: String(row.role),
      status: String(row.status)
    }));
  }

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
