import { computeFollowUpBucket, computeSlaBucket } from "../../domain/conversationInboxBuckets.js";
import type { LeadStatus } from "../../domain/entities.js";
import { flattenContactIdentityFields, resolveParticipantProfileImageUrl } from "../../lib/contactIdentityFlatten.js";
import { resolveConversationParticipantDisplayLabel } from "../../lib/conversationParticipantIdentity.js";
import {
  resolveLeadsInboxLifecycle,
  type LeadsInboxLifecycleFields,
  type LeadsInboxState
} from "../../lib/leadsInboxLifecycle.js";
import { classifyLeadSource, type LeadSourceType } from "../../domain/leadSourceClassification.js";

export type { LeadsInboxLifecycleFields, LeadsInboxState };

export type LeadsListItemDto = {
  leadId: string;
  conversationId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  channel: string;
  leadStatus: string;
  conversationStatus: string;
  ownerName: string | null;
  ownerId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  followUpAt: string | null;
  slaDueAt: string | null;
  isFollowUpOverdue: boolean;
  isSlaOverdue: boolean;
  createdAt: string;
  inboxState: LeadsInboxState;
  canOpenInbox: boolean;
  canReopenInbox: boolean;
  conversationArchivedAt: string | null;
  historyPurgedAt: string | null;
  mediaPurgedAt: string | null;
  retentionLabel: string | null;
  sourceType: LeadSourceType;
  sourceLabel: string;
  hasCommentContext: boolean;
  hasPrivateReply: boolean;
};

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

function resolveDisplayName(row: Record<string, unknown>): string {
  return resolveConversationParticipantDisplayLabel(row as Parameters<typeof resolveConversationParticipantDisplayLabel>[0]);
}

function resolveProfileImageUrl(row: Record<string, unknown>): string | null {
  return resolveParticipantProfileImageUrl(row);
}

export function toLeadsListItemDto(row: Record<string, unknown>, now: Date = new Date()): LeadsListItemDto {
  flattenContactIdentityFields(row);
  const lead = row.leads as
    | { status?: string; created_at?: string; createdAt?: string }
    | Array<{ status?: string; created_at?: string; createdAt?: string }>
    | null;
  const leadObj = Array.isArray(lead) ? lead[0] : lead;
  const agent = row.sales_agents as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  const agentObj = Array.isArray(agent) ? agent[0] : agent;

  const followUpAtIso = pickIso(row, "follow_up_at", "followUpAt");
  const slaDueAtIso = pickIso(row, "sla_due_at", "slaDueAt");
  const followUpAtDate = followUpAtIso ? new Date(followUpAtIso) : null;
  const slaDueAtDate = slaDueAtIso ? new Date(slaDueAtIso) : null;

  const leadStatus =
    typeof leadObj?.status === "string" && leadObj.status.trim()
      ? leadObj.status.trim()
      : "NEW";

  const createdAt =
    pickIso(leadObj ?? {}, "created_at", "createdAt") ??
    pickIso(row, "last_message_at", "lastMessageAt") ??
    now.toISOString();

  const lifecycle = resolveLeadsInboxLifecycle(row);
  const source = classifyLeadSource({
    channelType: String(row.channel_type ?? row.channelType ?? ""),
    providerThreadType: pickString(row, "provider_thread_type", "providerThreadType"),
    privateReplySentAt: pickIso(row, "private_reply_sent_at", "privateReplySentAt"),
    channelThreadId: String(row.channel_thread_id ?? row.channelThreadId ?? ""),
    providerCommentId: pickString(row, "provider_comment_id", "providerCommentId")
  });

  return {
    leadId: String(row.lead_id ?? row.leadId ?? ""),
    conversationId: String(row.id ?? ""),
    displayName: resolveDisplayName(row),
    profileImageUrl: resolveProfileImageUrl(row),
    channel: String(row.channel_type ?? row.channelType ?? ""),
    leadStatus,
    conversationStatus: String(row.status ?? "OPEN"),
    ownerName: typeof agentObj?.name === "string" && agentObj.name.trim() ? agentObj.name.trim() : null,
    ownerId: pickString(row, "assigned_agent_id", "assignedAgentId") ?? (typeof agentObj?.id === "string" ? agentObj.id : null),
    lastMessagePreview: pickString(row, "last_message_preview", "lastMessagePreview"),
    lastMessageAt: pickIso(row, "last_message_at", "lastMessageAt") ?? now.toISOString(),
    followUpAt: followUpAtIso,
    slaDueAt: slaDueAtIso,
    isFollowUpOverdue: computeFollowUpBucket(now, followUpAtDate) === "overdue",
    isSlaOverdue: computeSlaBucket(now, slaDueAtDate) === "overdue",
    createdAt,
    ...lifecycle,
    sourceType: source.sourceType,
    sourceLabel: source.sourceLabel,
    hasCommentContext: source.hasCommentContext,
    hasPrivateReply: source.hasPrivateReply
  };
}

/** Keys exposed on GET /api/leads items (guardrail for lean payload tests). */
export const LEADS_LIST_ITEM_DTO_KEYS = [
  "leadId",
  "conversationId",
  "displayName",
  "profileImageUrl",
  "channel",
  "leadStatus",
  "conversationStatus",
  "ownerName",
  "ownerId",
  "lastMessagePreview",
  "lastMessageAt",
  "followUpAt",
  "slaDueAt",
  "isFollowUpOverdue",
  "isSlaOverdue",
  "createdAt",
  "inboxState",
  "canOpenInbox",
  "canReopenInbox",
  "conversationArchivedAt",
  "historyPurgedAt",
  "mediaPurgedAt",
  "retentionLabel",
  "sourceType",
  "sourceLabel",
  "hasCommentContext",
  "hasPrivateReply"
] as const;

export function assertLeadsListItemDtoLean(item: Record<string, unknown>): void {
  const blocked = [
    "secret",
    "token",
    "payload_json",
    "secret_json",
    "access_token",
    "metadata_json",
    "rawWebhook",
    "providerPayload"
  ];
  for (const key of Object.keys(item)) {
    const lower = key.toLowerCase();
    if (blocked.some((b) => lower.includes(b))) {
      throw new Error(`Leads list item must not expose ${key}`);
    }
  }
}
