import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Conversation,
  ConversationAssignmentStatus,
  ConversationPriority,
  ConversationStatus
} from "../../../domain/entities.js";
import { toIsoTimestamp } from "../../../domain/dateUtils.js";
import type { ConversationForAssignment, ConversationRepository } from "../../../domain/ports.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";
import { isValidFacebookMessengerSendTarget, normalizeFacebookMessengerThreadTarget } from "../../../domain/facebookThreadTargets.js";
import {
  applyInboxFilterQuerySteps,
  buildInboxFilterQuerySteps
} from "../../../interfaces/api/conversationListInboxFilters.js";

const FACEBOOK_COMMENT_OBJECT_ID_PATTERN = /^\d+_\d+$/;

function parseOptionalTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseConversationPriority(value: unknown): ConversationPriority | undefined {
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (s === "LOW" || s === "NORMAL" || s === "HIGH" || s === "URGENT") return s;
  return undefined;
}

function parseConversationAssignmentStatus(value: unknown): ConversationAssignmentStatus | undefined {
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (s === "UNASSIGNED" || s === "ASSIGNED" || s === "REASSIGNED" || s === "UNASSIGNED_AGAIN") return s;
  return undefined;
}

function parseFollowUpNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    contactId: row.contact_id,
    channelAccountId: row.channel_account_id,
    channelType: row.channel_type,
    channelThreadId: row.channel_thread_id,
    providerThreadType: row.provider_thread_type ?? null,
    providerCommentId: row.provider_comment_id ?? null,
    providerPostId: row.provider_post_id ?? null,
    providerPageId: row.provider_page_id ?? null,
    providerExternalUserId: row.provider_external_user_id ?? null,
    privateReplySentAt: row.private_reply_sent_at ? new Date(row.private_reply_sent_at) : null,
    privateReplyCommentId: row.private_reply_comment_id ?? null,
    facebookPrivateReplySentAt: row.facebook_private_reply_sent_at ? new Date(row.facebook_private_reply_sent_at) : null,
    facebookPrivateReplyMessageId: row.facebook_private_reply_message_id ?? null,
    facebookPrivateReplyStatus: row.facebook_private_reply_status ?? null,
    facebookPublicReplySentAt: row.facebook_public_reply_sent_at ? new Date(row.facebook_public_reply_sent_at) : null,
    convertedToDmAt: row.converted_to_dm_at ? new Date(row.converted_to_dm_at) : null,
    participantDisplayName: row.participant_display_name ?? null,
    participantProfileImageUrl: row.participant_profile_image_url ?? null,
    unreadCount: typeof row.unread_count === "number" ? row.unread_count : 0,
    lastReadAt: row.last_read_at ? new Date(row.last_read_at) : null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageType: row.last_message_type ?? null,
    status: row.status,
    lastMessageAt: new Date(row.last_message_at),
    assignedAgentId: row.assigned_agent_id ?? null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    priority: parseConversationPriority(row.priority),
    assignmentStatus: parseConversationAssignmentStatus(row.assignment_status),
    slaDueAt: parseOptionalTimestamp(row.sla_due_at),
    followUpAt: parseOptionalTimestamp(row.follow_up_at),
    followUpNote: parseFollowUpNote(row.follow_up_note),
    firstResponseAt: parseOptionalTimestamp(row.first_response_at),
    lastCustomerMessageAt: parseOptionalTimestamp(row.last_customer_message_at),
    lastAgentMessageAt: parseOptionalTimestamp(row.last_agent_message_at)
  };
}

/** Explicit columns for Dashboard inbox list (no select("*")). */
const CONVERSATION_LIST_SELECT =
  "id,tenant_id,lead_id,contact_id,channel_type,channel_thread_id," +
  "participant_display_name,participant_profile_image_url,status,last_message_at," +
  "assigned_agent_id,assignment_status,priority,sla_due_at,first_response_at," +
  "last_customer_message_at,last_agent_message_at,follow_up_at,follow_up_note,resolved_at," +
  "unread_count,last_message_preview,last_message_type,provider_thread_type," +
  "provider_external_user_id,provider_page_id,private_reply_sent_at," +
  "leads(status,external_user_id)," +
  "contacts(display_name,profile_image_url,contact_identities(display_name,profile_image_url,channel_type,external_user_id))";

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

  async findById(tenantId: string, conversationId: string): Promise<Conversation | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapConversation(data) : null;
  }

  async findByIdForAssignment(tenantId: string, conversationId: string): Promise<ConversationForAssignment | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id, tenant_id, lead_id, assigned_agent_id, assignment_status, status")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      leadId: data.lead_id ?? null,
      assignedAgentId: data.assigned_agent_id ?? null,
      assignmentStatus: typeof data.assignment_status === "string" ? data.assignment_status : "",
      status: data.status
    };
  }

  async updateAssignment(input: {
    tenantId: string;
    conversationId: string;
    assignedAgentId: string | null;
    assignmentStatus: "ASSIGNED" | "REASSIGNED" | "UNASSIGNED_AGAIN";
  }): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .update({
        assigned_agent_id: input.assignedAgentId,
        assignment_status: input.assignmentStatus,
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (error) throw error;
  }

  async findFacebookMessengerDmByParticipant(input: {
    tenantId: string;
    providerPageId: string;
    providerExternalUserId: string;
  }): Promise<Conversation | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("channel_type", "FACEBOOK")
      .eq("provider_thread_type", "MESSENGER_DM")
      .eq("provider_page_id", input.providerPageId)
      .eq("provider_external_user_id", input.providerExternalUserId)
      .not("channel_thread_id", "is", null)
      .like("channel_thread_id", "user:%")
      .order("last_message_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const exactThread = `user:${input.providerExternalUserId}`;
    const ranked = rows
      .filter((row) => {
        const threadId = String(row.channel_thread_id ?? "").trim();
        if (FACEBOOK_COMMENT_OBJECT_ID_PATTERN.test(threadId)) return false;
        return isValidFacebookMessengerSendTarget(threadId, row.provider_external_user_id, { allowRawPsid: true });
      })
      .sort((a, b) => {
        const aExact = String(a.channel_thread_id ?? "").trim() === exactThread ? 1 : 0;
        const bExact = String(b.channel_thread_id ?? "").trim() === exactThread ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aLast = a.last_message_at ? new Date(a.last_message_at).getTime() : -1;
        const bLast = b.last_message_at ? new Date(b.last_message_at).getTime() : -1;
        if (aLast !== bLast) return bLast - aLast;
        const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : -1;
        const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : -1;
        return bUpdated - aUpdated;
      });
    return ranked[0] ? mapConversation(ranked[0]) : null;
  }

  async findLatestFacebookCommentByParticipant(input: {
    tenantId: string;
    providerPageId: string;
    providerExternalUserId: string;
  }): Promise<Conversation | null> {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("channel_type", "FACEBOOK")
      .eq("provider_thread_type", "FACEBOOK_COMMENT")
      .eq("provider_page_id", input.providerPageId)
      .eq("provider_external_user_id", input.providerExternalUserId)
      .order("last_message_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapConversation(data) : null;
  }

  async findLatestFacebookCommentByLead(input: {
    tenantId: string;
    leadId: string;
    providerPageId?: string;
  }): Promise<Conversation | null> {
    let query = this.supabase
      .from("conversations")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("lead_id", input.leadId)
      .eq("channel_type", "FACEBOOK")
      .eq("provider_thread_type", "FACEBOOK_COMMENT");
    if (input.providerPageId?.trim()) {
      query = query.eq("provider_page_id", input.providerPageId.trim());
    }
    const { data, error } = await query
      .order("last_message_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
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
        provider_thread_type: data.providerThreadType ?? null,
        provider_comment_id: data.providerCommentId ?? null,
        provider_post_id: data.providerPostId ?? null,
        provider_page_id: data.providerPageId ?? null,
        provider_external_user_id: data.providerExternalUserId ?? null,
        private_reply_sent_at: data.privateReplySentAt ? data.privateReplySentAt.toISOString() : null,
        private_reply_comment_id: data.privateReplyCommentId ?? null,
        facebook_private_reply_sent_at: data.facebookPrivateReplySentAt ? data.facebookPrivateReplySentAt.toISOString() : null,
        facebook_private_reply_message_id: data.facebookPrivateReplyMessageId ?? null,
        facebook_private_reply_status: data.facebookPrivateReplyStatus ?? null,
        facebook_public_reply_sent_at: data.facebookPublicReplySentAt ? data.facebookPublicReplySentAt.toISOString() : null,
        converted_to_dm_at: data.convertedToDmAt ? data.convertedToDmAt.toISOString() : null,
        participant_display_name: data.participantDisplayName ?? null,
        participant_profile_image_url: data.participantProfileImageUrl ?? null,
        unread_count: typeof data.unreadCount === "number" ? Math.max(0, data.unreadCount) : 0,
        last_read_at: data.lastReadAt ? data.lastReadAt.toISOString() : null,
        last_message_preview: data.lastMessagePreview ?? null,
        last_message_type: data.lastMessageType ?? null,
        status: data.status,
        last_message_at: toIsoTimestamp(data.lastMessageAt),
        last_customer_message_at: data.lastCustomerMessageAt ? toIsoTimestamp(data.lastCustomerMessageAt) : null,
        sla_due_at: data.slaDueAt ? toIsoTimestamp(data.slaDueAt) : null
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
    lastCustomerMessageAt?: Date;
    slaDueAt?: Date;
    reopenFromResolved?: boolean;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      last_message_at: toIsoTimestamp(at),
      updated_at: new Date().toISOString()
    };
    if (opts?.lastCustomerMessageAt) {
      patch.last_customer_message_at = toIsoTimestamp(opts.lastCustomerMessageAt);
    }
    if (opts?.slaDueAt) {
      patch.sla_due_at = toIsoTimestamp(opts.slaDueAt);
    }
    if (opts?.reopenFromResolved) {
      patch.status = "OPEN";
      patch.resolved_at = null;
    }
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

  async recordAgentOutboundSent(input: { tenantId: string; conversationId: string; sentAt: Date }): Promise<void> {
    const { data: row, error: readError } = await this.supabase
      .from("conversations")
      .select("first_response_at, last_customer_message_at")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return;

    const patch: Record<string, unknown> = {
      last_agent_message_at: toIsoTimestamp(input.sentAt),
      sla_due_at: null,
      updated_at: new Date().toISOString()
    };

    const firstAlready = row.first_response_at != null && String(row.first_response_at).trim() !== "";
    const lastCustomerRaw = row.last_customer_message_at;
    const lastCustomerAt =
      lastCustomerRaw != null && String(lastCustomerRaw).trim() !== ""
        ? new Date(String(lastCustomerRaw))
        : null;

    if (
      !firstAlready &&
      lastCustomerAt != null &&
      !Number.isNaN(lastCustomerAt.getTime()) &&
      input.sentAt.getTime() >= lastCustomerAt.getTime()
    ) {
      patch.first_response_at = toIsoTimestamp(input.sentAt);
    }

    const { error } = await this.supabase
      .from("conversations")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (error) throw error;
  }

  async updateInstagramProviderContext(input: {
    tenantId: string;
    conversationId: string;
    providerPageId: string;
  }): Promise<void> {
    const pageId = input.providerPageId.trim();
    if (!pageId) return;
    const { error } = await this.supabase
      .from("conversations")
      .update({
        provider_page_id: pageId,
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId)
      .is("provider_page_id", null);
    if (error) throw error;
  }

  async markFacebookCommentPrivateReplySent(input: {
    tenantId: string;
    conversationId: string;
    privateReplyCommentId: string;
    convertedToDm: boolean;
    nextChannelThreadId?: string | null;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      private_reply_sent_at: nowIso,
      private_reply_comment_id: input.privateReplyCommentId,
      facebook_private_reply_sent_at: nowIso,
      facebook_private_reply_message_id: input.privateReplyCommentId,
      facebook_private_reply_status: "SENT",
      updated_at: nowIso
    };
    if (input.convertedToDm) {
      const normalizedDmThreadId = normalizeFacebookMessengerThreadTarget(input.nextChannelThreadId ?? null);
      if (normalizedDmThreadId) {
        patch.converted_to_dm_at = nowIso;
        patch.provider_thread_type = "MESSENGER_DM";
        patch.channel_thread_id = normalizedDmThreadId;
      }
    }
    const { error } = await this.supabase
      .from("conversations")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (!error) return;
    if (!(input.convertedToDm && patch.channel_thread_id && isValidFacebookMessengerSendTarget(String(patch.channel_thread_id), null, { allowRawPsid: true }))) {
      throw error;
    }

    // Fallback: if DM-thread switch fails (e.g. duplicate user:<psid> conversation),
    // keep conversion/private-reply markers and continue without changing thread id.
    const fallbackPatch: Record<string, unknown> = {
      private_reply_sent_at: nowIso,
      private_reply_comment_id: input.privateReplyCommentId,
      facebook_private_reply_sent_at: nowIso,
      facebook_private_reply_message_id: input.privateReplyCommentId,
      facebook_private_reply_status: "SENT",
      updated_at: nowIso
    };
    const { error: fallbackError } = await this.supabase
      .from("conversations")
      .update(fallbackPatch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (fallbackError) throw fallbackError;
  }

  async markFacebookPublicReplySent(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .update({
        facebook_public_reply_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId);
    if (error) throw error;
  }

  async updateConversationStatus(input: {
    tenantId: string;
    conversationId: string;
    status: ConversationStatus;
    resolvedAtIso: string | null;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("conversations")
      .update({
        status: input.status,
        resolved_at: input.resolvedAtIso,
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (error) throw error;
  }

  async updateConversationFollowUp(input: {
    tenantId: string;
    conversationId: string;
    patch: { followUpAt?: Date | null; followUpNote?: string | null };
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };
    if (Object.prototype.hasOwnProperty.call(input.patch, "followUpAt")) {
      patch.follow_up_at =
        input.patch.followUpAt === null ? null : toIsoTimestamp(input.patch.followUpAt as Date);
    }
    if (Object.prototype.hasOwnProperty.call(input.patch, "followUpNote")) {
      patch.follow_up_note = input.patch.followUpNote;
    }
    const { error } = await this.supabase
      .from("conversations")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.conversationId);
    if (error) throw error;
  }

  async list(input: {
    tenantId: string;
    status?: string;
    channel?: string;
    assignedSalesId?: string;
    assignmentFilter?: "none" | "unassigned" | { assignedToAgentId: string };
    inboxFilters?: import("../../../interfaces/api/conversationListInboxFilters.js").ConversationListInboxFilters;
    limit: number;
    cursor?: string;
  }): Promise<{ items: any[]; nextCursor: string | null }> {
    const safeLimit = Math.max(1, Math.min(100, input.limit));
    const cursor = decodeRepoCursor<{ lastMessageAt: string; id: string }>(input.cursor);
    let q = this.supabase
      .from("conversations")
      .select(CONVERSATION_LIST_SELECT)
      .eq("tenant_id", input.tenantId)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit + 1);
    if (input.status) q = q.eq("status", input.status);
    if (input.channel) q = q.eq("channel_type", input.channel);
    if (input.assignedSalesId) q = q.eq("assigned_agent_id", input.assignedSalesId);
    const af = input.assignmentFilter ?? "none";
    if (af === "unassigned") {
      q = q.is("assigned_agent_id", null);
    } else if (typeof af === "object" && af.assignedToAgentId) {
      q = q.eq("assigned_agent_id", af.assignedToAgentId);
    }
    const inboxSteps = buildInboxFilterQuerySteps(input.inboxFilters);
    if (inboxSteps.length > 0) {
      q = applyInboxFilterQuerySteps(q, inboxSteps);
    }
    if (cursor?.lastMessageAt && cursor?.id) {
      q = q.or(
        `last_message_at.lt."${cursor.lastMessageAt}",and(last_message_at.eq."${cursor.lastMessageAt}",id.lt."${cursor.id}")`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.slice(0, safeLimit);
    const tail = (items[items.length - 1] ?? null) as any;
    const nextCursor =
      rows.length > safeLimit && tail
        ? encodeRepoCursor({ lastMessageAt: String(tail.last_message_at ?? ""), id: String(tail.id ?? "") })
        : null;
    return { items, nextCursor };
  }
}
