import { computeFollowUpBucket, computeSlaBucket } from "../../domain/conversationInboxBuckets.js";
import type { LeadStatus } from "../../domain/entities.js";

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

function flattenContactIdentityFields(row: Record<string, unknown>): void {
  const lead = row.leads as { external_user_id?: string } | undefined;
  const ext = lead?.external_user_id;
  const channel = row.channel_type;
  const rawIdentities = (row.contacts as { contact_identities?: unknown } | undefined)?.contact_identities as
    | Array<{ channel_type?: string; external_user_id?: string; display_name?: string | null; profile_image_url?: string | null }>
    | { channel_type?: string; external_user_id?: string; display_name?: string | null; profile_image_url?: string | null }
    | undefined;
  const identities = Array.isArray(rawIdentities) ? rawIdentities : rawIdentities ? [rawIdentities] : [];
  if (identities.length > 0 && ext && channel) {
    const match = identities.find((i) => i.channel_type === channel && i.external_user_id === ext);
    if (match?.display_name) row.contactIdentityDisplayName = match.display_name;
    if (match?.profile_image_url) row.contactIdentityProfileImageUrl = match.profile_image_url;
  }
}

function resolveDisplayName(row: Record<string, unknown>): string | null {
  const contacts = row.contacts as { display_name?: string | null } | null;
  const lead = row.leads as { name?: string | null } | { name?: string | null }[] | null;
  const leadObj = Array.isArray(lead) ? lead[0] : lead;
  return (
    pickString(row, "participant_display_name", "participantDisplayName") ??
    pickString(row, "contactIdentityDisplayName", "contact_identity_display_name") ??
    (typeof contacts?.display_name === "string" ? contacts.display_name.trim() || null : null) ??
    (typeof leadObj?.name === "string" ? leadObj.name.trim() || null : null)
  );
}

function resolveProfileImageUrl(row: Record<string, unknown>): string | null {
  const contacts = row.contacts as { profile_image_url?: string | null } | null;
  return (
    pickString(row, "participant_profile_image_url", "participantProfileImageUrl") ??
    pickString(row, "contactIdentityProfileImageUrl", "contact_identity_profile_image_url") ??
    (typeof contacts?.profile_image_url === "string" ? contacts.profile_image_url.trim() || null : null)
  );
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
    createdAt
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
  "createdAt"
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
