import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation } from "../../../domain/entities.js";
import { toIsoTimestamp } from "../../../domain/dateUtils.js";
import type { ConversationRepository } from "../../../domain/ports.js";

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    contactId: row.contact_id,
    channelAccountId: row.channel_account_id,
    channelType: row.channel_type,
    channelThreadId: row.channel_thread_id,
    status: row.status,
    lastMessageAt: new Date(row.last_message_at)
  };
}

export class SupabaseConversationRepository implements ConversationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByThread(tenantId: string, channel: Conversation["channelType"], threadId: string): Promise<Conversation | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("channel_type", channel)
      .eq("channel_thread_id", threadId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapConversation(data) : null;
  }

  async create(data: Omit<Conversation, "id">): Promise<Conversation> {
    const { data: row, error } = await this.supabase
      .from("conversations")
      .insert({
        tenant_id: data.tenantId,
        lead_id: data.leadId,
        contact_id: data.contactId ?? null,
        channel_account_id: data.channelAccountId ?? null,
        channel_type: data.channelType,
        channel_thread_id: data.channelThreadId,
        status: data.status,
        last_message_at: toIsoTimestamp(data.lastMessageAt)
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapConversation(row);
  }

  async touchLastMessage(conversationId: string, at: Date): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .update({ last_message_at: toIsoTimestamp(at), updated_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (error) throw error;
  }

  async list(input: { tenantId: string; status?: string; channel?: string; assignedSalesId?: string }): Promise<any[]> {
    let q = this.supabase
      .from("conversations")
      .select(
        "id,lead_id,contact_id,channel_account_id,channel_type,channel_thread_id,status,last_message_at,assigned_agent_id,leads(id,name,status,assigned_sales_id,source_channel),contacts(id,display_name,phone,email),channel_accounts(id,channel,external_account_id,display_name)"
      )
      .eq("tenant_id", input.tenantId)
      .order("last_message_at", { ascending: false });
    if (input.status) q = q.eq("status", input.status);
    if (input.channel) q = q.eq("channel_type", input.channel);
    if (input.assignedSalesId) q = q.eq("assigned_agent_id", input.assignedSalesId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }
}
