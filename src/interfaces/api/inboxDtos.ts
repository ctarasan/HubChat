import type { Message } from "../../domain/entities.js";
import { toIsoTimestamp } from "../../domain/dateUtils.js";
import {
  flattenContactIdentityFields,
  resolveParticipantProfileImageUrl
} from "../../lib/contactIdentityFlatten.js";
import { resolveMessageMediaUrls } from "../../lib/mediaPolicy.js";
import { leadStatusToManagementStatus } from "../../domain/leadManagementStatus.js";
import type { LeadStatus } from "../../domain/entities.js";
import { classifyLeadSource, type LeadSourceType } from "../../domain/leadSourceClassification.js";
import {
  resolveConnectionLabelForRow,
  type ConnectionScopeBucket,
  type TenantConnectionScopeContext
} from "../../domain/channelConnectionScope.js";

/** Lean conversation row for Dashboard sidebar / Team Inbox (target: minimal JSON per item). */
export type ConversationListItemDto = {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  contact_id: string | null;
  channel_type: string;
  channel_thread_id: string;
  provider_thread_type: string | null;
  provider_external_user_id: string | null;
  provider_page_id: string | null;
  participant_display_name: string | null;
  participant_profile_image_url: string | null;
  contact_identity_display_name: string | null;
  contact_identity_profile_image_url: string | null;
  external_user_id: string | null;
  lead_status: string | null;
  lead_management_status: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_type: string | null;
  unread_count: number;
  assigned_agent_id: string | null;
  assignment_status: string | null;
  status: string;
  priority: string | null;
  sla_due_at: string | null;
  first_response_at: string | null;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  resolved_at: string | null;
  private_reply_sent_at: string | null;
  source_type: LeadSourceType;
  source_label: string;
  has_comment_context: boolean;
  has_private_reply: boolean;
  connection_label: string | null;
  connection_scope_bucket: ConnectionScopeBucket;
};

/** Lean message row for Dashboard timeline (delivery + media preview only). */
export type MessageListItemDto = {
  id: string;
  conversation_id: string;
  direction: "INBOUND" | "OUTBOUND";
  sender_type: string;
  content: string;
  message_type: string;
  occurred_at: string;
  created_at: string;
  media_url: string | null;
  preview_url: string | null;
  media_mime_type: string | null;
  file_name: string | null;
  metadata_json: Record<string, unknown>;
};

const MESSAGE_METADATA_ALLOWLIST = [
  "delivery_status",
  "delivery_error_message",
  "delivery_error_code",
  "reason",
  "previewUrl",
  "mediaUrl",
  "thumbnailUrl",
  "fullImageUrl",
  "instagramRecipientId"
] as const;

/** Never exposed on hot message list APIs (storage paths, provider raw payloads). */
export const MESSAGE_METADATA_BLOCKED_KEYS = [
  "storageBucket",
  "originalPath",
  "thumbPath",
  "urlMode",
  "signedUrlExpiresInSec",
  "rawWebhook",
  "providerPayload",
  "lineMessageId"
] as const;

export function slimMessageMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of MESSAGE_METADATA_ALLOWLIST) {
    const v = metadata[key];
    if (v !== undefined && v !== null) out[key] = v;
  }
  return out;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickIso(row: Record<string, unknown>, ...keys: string[]): string | null {
  const s = pickString(row, ...keys);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type ConversationListItemDtoOptions = {
  connectionScopeContext?: TenantConnectionScopeContext | null;
};

/** Map repository list row (after join flatten) to API DTO. */
export function toConversationListItemDto(
  row: Record<string, unknown>,
  options?: ConversationListItemDtoOptions
): ConversationListItemDto {
  flattenContactIdentityFields(row);
  const lead = row.leads as { status?: string; external_user_id?: string } | { status?: string; external_user_id?: string }[] | null;
  const leadObj = Array.isArray(lead) ? lead[0] : lead;
  const contacts = row.contacts as { display_name?: string | null; profile_image_url?: string | null } | null;
  const unreadRaw = row.unread_count ?? row.unreadCount;
  const unread =
    typeof unreadRaw === "number" && Number.isFinite(unreadRaw) ? Math.max(0, Math.floor(unreadRaw)) : 0;
  const lastAt = pickIso(row, "last_message_at", "lastMessageAt") ?? new Date(0).toISOString();
  const followUpAtRaw = pickIso(row, "follow_up_at", "followUpAt");
  const followUpAtDate = followUpAtRaw ? new Date(followUpAtRaw) : null;
  const leadStatusRaw = leadObj?.status;
  const leadManagementStatus =
    typeof leadStatusRaw === "string" && leadStatusRaw.length > 0
      ? leadStatusToManagementStatus(leadStatusRaw as LeadStatus, followUpAtDate)
      : null;
  const resolvedProfileImageUrl = resolveParticipantProfileImageUrl(row);
  const source = classifyLeadSource({
    channelType: String(row.channel_type ?? row.channelType ?? ""),
    providerThreadType: pickString(row, "provider_thread_type", "providerThreadType"),
    privateReplySentAt: pickIso(row, "private_reply_sent_at", "privateReplySentAt"),
    channelThreadId: String(row.channel_thread_id ?? row.channelThreadId ?? ""),
    providerCommentId: pickString(row, "provider_comment_id", "providerCommentId")
  });
  const connection = options?.connectionScopeContext
    ? resolveConnectionLabelForRow(row, options.connectionScopeContext)
    : { connectionLabel: null, connectionScopeBucket: "unknown" as ConnectionScopeBucket };

  return {
    id: String(row.id ?? ""),
    tenant_id: String(row.tenant_id ?? row.tenantId ?? ""),
    lead_id: pickString(row, "lead_id", "leadId"),
    contact_id: pickString(row, "contact_id", "contactId"),
    channel_type: String(row.channel_type ?? row.channelType ?? ""),
    channel_thread_id: String(row.channel_thread_id ?? row.channelThreadId ?? ""),
    provider_thread_type: pickString(row, "provider_thread_type", "providerThreadType"),
    provider_external_user_id: pickString(row, "provider_external_user_id", "providerExternalUserId"),
    provider_page_id: pickString(row, "provider_page_id", "providerPageId"),
    participant_display_name: pickString(row, "participant_display_name", "participantDisplayName"),
    participant_profile_image_url: resolvedProfileImageUrl,
    contact_identity_display_name:
      pickString(row, "contactIdentityDisplayName", "contact_identity_display_name") ??
      (typeof contacts?.display_name === "string" ? contacts.display_name.trim() || null : null),
    contact_identity_profile_image_url: resolvedProfileImageUrl,
    external_user_id: leadObj?.external_user_id ?? pickString(row, "external_user_id", "externalUserId"),
    lead_status: leadObj?.status ?? null,
    lead_management_status: leadManagementStatus,
    last_message_at: lastAt,
    last_message_preview: pickString(row, "last_message_preview", "lastMessagePreview"),
    last_message_type: pickString(row, "last_message_type", "lastMessageType"),
    unread_count: unread,
    assigned_agent_id: pickString(row, "assigned_agent_id", "assignedAgentId"),
    assignment_status: pickString(row, "assignment_status", "assignmentStatus"),
    status: String(row.status ?? "OPEN"),
    priority: pickString(row, "priority"),
    sla_due_at: pickIso(row, "sla_due_at", "slaDueAt"),
    first_response_at: pickIso(row, "first_response_at", "firstResponseAt"),
    last_customer_message_at: pickIso(row, "last_customer_message_at", "lastCustomerMessageAt"),
    last_agent_message_at: pickIso(row, "last_agent_message_at", "lastAgentMessageAt"),
    follow_up_at: pickIso(row, "follow_up_at", "followUpAt"),
    follow_up_note: pickString(row, "follow_up_note", "followUpNote"),
    resolved_at: pickIso(row, "resolved_at", "resolvedAt"),
    private_reply_sent_at: pickIso(row, "private_reply_sent_at", "privateReplySentAt"),
    source_type: source.sourceType,
    source_label: source.sourceLabel,
    has_comment_context: source.hasCommentContext,
    has_private_reply: source.hasPrivateReply,
    connection_label: connection.connectionLabel,
    connection_scope_bucket: connection.connectionScopeBucket
  };
}

export function toMessageListItemDto(message: Message): MessageListItemDto {
  const metadata = slimMessageMetadata(message.metadataJson ?? {});
  const urls = resolveMessageMediaUrls({
    messageType: message.messageType ?? "TEXT",
    mediaUrl: message.mediaUrl,
    previewUrl: message.previewUrl,
    metadataJson: message.metadataJson ?? {}
  });

  return {
    id: message.id,
    conversation_id: message.conversationId,
    direction: message.direction,
    sender_type: message.senderType,
    content: message.content ?? "",
    message_type: message.messageType ?? "TEXT",
    occurred_at: toIsoTimestamp(message.occurredAt ?? message.createdAt),
    created_at: toIsoTimestamp(message.createdAt),
    media_url: urls.downloadUrl,
    preview_url: urls.previewUrl,
    media_mime_type: message.mediaMimeType ?? null,
    file_name: message.fileName ?? null,
    metadata_json: metadata
  };
}

/** Keys allowed on conversation list API items (regression guard for payload budget). */
export const CONVERSATION_LIST_DTO_KEYS = [
  "id",
  "tenant_id",
  "lead_id",
  "contact_id",
  "channel_type",
  "channel_thread_id",
  "provider_thread_type",
  "provider_external_user_id",
  "provider_page_id",
  "participant_display_name",
  "participant_profile_image_url",
  "contact_identity_display_name",
  "contact_identity_profile_image_url",
  "external_user_id",
  "lead_status",
  "lead_management_status",
  "last_message_at",
  "last_message_preview",
  "last_message_type",
  "unread_count",
  "assigned_agent_id",
  "assignment_status",
  "status",
  "priority",
  "sla_due_at",
  "first_response_at",
  "last_customer_message_at",
  "last_agent_message_at",
  "follow_up_at",
  "follow_up_note",
  "resolved_at",
  "private_reply_sent_at",
  "source_type",
  "source_label",
  "has_comment_context",
  "has_private_reply",
  "connection_label",
  "connection_scope_bucket"
] as const;

export const MESSAGE_LIST_DTO_KEYS = [
  "id",
  "conversation_id",
  "direction",
  "sender_type",
  "content",
  "message_type",
  "occurred_at",
  "created_at",
  "media_url",
  "preview_url",
  "media_mime_type",
  "file_name",
  "metadata_json"
] as const;
