import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadStatus } from "../../../domain/entities.js";
import type { LeadRepository } from "../../../domain/ports.js";

function mapLead(row: any): Lead {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceChannel: row.source_channel,
    externalUserId: row.external_user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    assignedSalesId: row.assigned_sales_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastContactAt: row.last_contact_at ? new Date(row.last_contact_at) : null,
    leadScore: row.lead_score,
    tags: row.tags ?? []
  };
}

export class SupabaseLeadRepository implements LeadRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByExternalUser(tenantId: string, channel: Lead["sourceChannel"], externalUserId: string): Promise<Lead | null> {
    const { data, error } = await this.supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("source_channel", channel)
      .eq("external_user_id", externalUserId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapLead(data) : null;
  }

  async create(data: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead> {
    const { data: row, error } = await this.supabase
      .from("leads")
      .insert({
        tenant_id: data.tenantId,
        source_channel: data.sourceChannel,
        external_user_id: data.externalUserId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        status: data.status,
        assigned_sales_id: data.assignedSalesId,
        last_contact_at: data.lastContactAt?.toISOString() ?? null,
        lead_score: data.leadScore ?? null,
        tags: data.tags
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapLead(row);
  }

  async updateStatus(leadId: string, status: LeadStatus): Promise<void> {
    const { error } = await this.supabase
      .from("leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw error;
  }

  async assign(leadId: string, salesAgentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("leads")
      .update({
        assigned_sales_id: salesAgentId,
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);
    if (error) throw error;
  }

  async findById(tenantId: string, leadId: string): Promise<Lead | null> {
    const { data, error } = await this.supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapLead(data) : null;
  }

  async list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    assignedSalesId?: string;
    lastActivityFrom?: string;
    lastActivityTo?: string;
  }): Promise<Lead[]> {
    let q = this.supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .order("updated_at", { ascending: false });
    if (input.status) q = q.eq("status", input.status);
    if (input.channel) q = q.eq("source_channel", input.channel);
    if (input.assignedSalesId) q = q.eq("assigned_sales_id", input.assignedSalesId);
    if (input.lastActivityFrom) q = q.gte("last_contact_at", input.lastActivityFrom);
    if (input.lastActivityTo) q = q.lte("last_contact_at", input.lastActivityTo);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapLead);
  }

  async patch(tenantId: string, leadId: string, patch: { status?: LeadStatus; tags?: string[] }): Promise<void> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status) payload.status = patch.status;
    if (patch.tags) payload.tags = patch.tags;
    const { error } = await this.supabase.from("leads").update(payload).eq("tenant_id", tenantId).eq("id", leadId);
    if (error) throw error;
  }
}
