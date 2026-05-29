/**
 * Shared participant display label resolution for Inbox and Leads list APIs.
 * Matches Dashboard `resolveConversationParticipantName` fallback order.
 */

export type ConversationParticipantIdentityRow = {
  participant_display_name?: string | null;
  participantDisplayName?: string | null;
  contacts?: { display_name?: string | null; displayName?: string | null } | null;
  contactIdentityDisplayName?: string | null;
  contact_identity_display_name?: string | null;
  leads?:
    | { name?: string | null; external_user_id?: string | null }
    | Array<{ name?: string | null; external_user_id?: string | null }>
    | null;
  provider_external_user_id?: string | null;
  providerExternalUserId?: string | null;
  external_user_id?: string | null;
  externalUserId?: string | null;
  channel_thread_id?: string | null;
  channelThreadId?: string | null;
};

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Resolve a human-readable label for a conversation participant.
 * Priority: participant name → contact identity → lead name → provider/user id → thread id.
 */
export function resolveConversationParticipantDisplayLabel(
  row: ConversationParticipantIdentityRow,
  options?: { unknownLabel?: string }
): string {
  const lead = row.leads;
  const leadObj = Array.isArray(lead) ? lead[0] : lead;
  const candidates = [
    row.participant_display_name,
    row.participantDisplayName,
    row.contacts?.display_name,
    row.contacts?.displayName,
    row.contactIdentityDisplayName,
    row.contact_identity_display_name,
    leadObj?.name,
    row.provider_external_user_id,
    row.providerExternalUserId,
    leadObj?.external_user_id,
    row.external_user_id,
    row.externalUserId,
    row.channel_thread_id,
    row.channelThreadId
  ];
  for (const c of candidates) {
    const label = normalizeLabel(c);
    if (label) return label;
  }
  return options?.unknownLabel ?? "Unknown User";
}

/** Safe short preview of an external id for optional DTO fields (no truncation in Inbox today). */
export function previewExternalUserId(value: string | null | undefined): string | null {
  const t = normalizeLabel(value);
  if (!t) return null;
  if (t.length <= 32) return t;
  return `${t.slice(0, 12)}…${t.slice(-8)}`;
}
