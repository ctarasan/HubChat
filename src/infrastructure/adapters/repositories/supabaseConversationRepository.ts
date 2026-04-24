import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation } from "../../../domain/entities.js";
import { toIsoTimestamp } from "../../../domain/dateUtils.js";
import type { ConversationRepository } from "../../../domain/ports.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    contactId: row.contact_id,
    channelAccountId: row.channel_account_id,
    channelType: row.channel_type,
    channelThreadId: row.channel_thread_id,
    participantDisplayName: row.participant_display_name ?? null,
    participantProfileImageUrl: row.participant_profile_image_url ?? null,
    unreadCount: typeof row.unread_count === "number" ? row.unread_count : 0,
    lastReadAt: row.last_read_at ? new Date(row.last_read_at) : null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageType: row.last_message_type ?? null,
    status: row.status,
    lastMessageAt: new Date(row.last_message_at)
  };
}

function flattenContactIdentityFields(row: any): void {
  const lead = row.leads as { external_user_id?: string } | undefined;
  const ext = lead?.external_user_id;
  const channel = row.channel_type;
  const rawIdentities = row.contacts?.contact_identities as
    | Array<{ channel_type?: string; external_user_id?: string; display_name?: string | null; profile_image_url?: string | null }>
    | { channel_type?: string; external_user_id?: string; display_name?: string | null; profile_image_url?: string | null }
    | undefined;
  const identities = Array.isArray(rawIdentities) ? rawIdentities : rawIdentities ? [rawIdentities] : [];
  let identityDisplay: string | null = null;
  let identityImage: string | null = null;
  if (identities.length > 0 && ext && channel) {
    const match = identities.find((i) => i.channel_type === channel && i.external_user_id === ext);
    identityDisplay = match?.display_name ?? null;
    identityImage = match?.profile_image_url ?? null;
  }
  row.contactIdentityDisplayName = identityDisplay;
  row.contactIdentityProfileImageUrl = identityImage;
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
        participant_display_name: data.participantDisplayName ?? null,
        participant_profile_image_url: data.participantProfileImageUrl ?? null,
        unread_count: typeof data.unreadCount === "number" ? Math.max(0, data.unreadCount) : 0,
        last_read_at: data.lastReadAt ? data.lastReadAt.toISOString() : null,
        last_message_preview: data.lastMessagePreview ?? null,
        last_message_type: data.lastMessageType ?? null,
        status: data.status,
        last_message_at: toIsoTimestamp(data.lastMessageAt)
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapConversation(row);
  }

  async touchLastMessage(conversationId: string, at: Date, opts?: {
    participantDisplayName?: string | null;
    participantProfileImageUrl?: string | null;
    incrementUnreadCount?: boolean;
    lastMessagePreview?: string | null;
    lastMessageType?: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      last_message_at: toIsoTimestamp(at),
      updated_at: new Date().toISOString()
    };
    if (typeof opts?.participantDisplayName === "string" && opts.participantDisplayName.trim()) {
      patch.participant_display_name = opts.participantDisplayName.trim();
    }
    if (typeof opts?.participantProfileImageUrl === "string" && opts.participantProfileImageUrl.trim()) {
      patch.participant_profile_image_url = opts.participantProfileImageUrl.trim();
    }
    if (typeof opts?.lastMessagePreview === "string" && opts.lastMessagePreview.trim()) {
      patch.last_message_preview = opts.lastMessagePreview.trim().slice(0, 120);
    }
    if (typeof opts?.lastMessageType === "string" && opts.lastMessageType.trim()) {
      patch.last_message_type = opts.lastMessageType.trim().toUpperCase();
    }
    let q = this.supabase
      .from("conversations")
      .update(patch)
      .eq("id", conversationId);
    if (opts?.incrementUnreadCount) {
      const { data: row, error: lookupError } = await this.supabase
        .from("conversations")
        .select("unread_count")
        .eq("id", conversationId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      const currentUnread = typeof row?.unread_count === "number" ? row.unread_count : 0;
      patch.unread_count = Math.max(0, currentUnread + 1);
      q = this.supabase
        .from("conversations")
        .update(patch)
        .eq("id", conversationId);
    }
    const { error } = await q;
    if (error) throw error;
  }

  async markAsRead(input: { tenantId: string; conversationId: string }): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .update({
        unread_count: 0,
        last_read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (error) throw error;
  }

  async list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    assignedSalesId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: any[]; nextCursor: string | null }> {
    const safeLimit = Math.max(1, Math.min(100, input.limit));
    const cursor = decodeRepoCursor<{ lastMessageAt: string; id: string }>(input.cursor);
    let q = this.supabase
      .from("conversations")
      .select(
        "id,lead_id,contact_id,channel_account_id,channel_type,channel_thread_id,participant_display_name,participant_profile_image_url,status,last_message_at,assigned_agent_id,leads(id,name,status,assigned_sales_id,source_channel,external_user_id),contacts(id,display_name,phone,email,profile_image_url,contact_identities(display_name,profile_image_url,channel_type,external_user_id)),channel_accounts(id,channel,external_account_id,display_name)"
        + ",unread_count,last_read_at,last_message_preview,last_message_type"
      )
      .eq("tenant_id", input.tenantId)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit + 1);
    if (input.status) q = q.eq("status", input.status);
    if (input.channel) q = q.eq("channel_type", input.channel);
    if (input.assignedSalesId) q = q.eq("assigned_agent_id", input.assignedSalesId);
    if (cursor?.lastMessageAt && cursor?.id) {
      q = q.or(
        `last_message_at.lt."${cursor.lastMessageAt}",and(last_message_at.eq."${cursor.lastMessageAt}",id.lt."${cursor.id}")`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.slice(0, safeLimit).map((row) => {
      flattenContactIdentityFields(row);
      return row;
    });
    const tail = (items[items.length - 1] ?? null) as any;
    const nextCursor =
      rows.length > safeLimit && tail
        ? encodeRepoCursor({ lastMessageAt: String(tail.last_message_at ?? ""), id: String(tail.id ?? "") })
        : null;
    return { items, nextCursor };
  }
}
