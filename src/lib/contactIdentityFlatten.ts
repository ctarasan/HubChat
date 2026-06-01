export type ContactIdentityJoinRow = {
  channel_type?: string;
  external_user_id?: string;
  display_name?: string | null;
  profile_image_url?: string | null;
};

/** Accept only absolute HTTPS image URLs (matches Dashboard avatar policy). */
export function pickHttpsProfileImageUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (!t) continue;
    try {
      if (new URL(t).protocol === "https:") return t;
    } catch {
      continue;
    }
  }
  return null;
}

function pickTrimmedString(...values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** External ids used to match `contact_identities` (IG often differs lead vs provider id). */
export function externalUserIdsForContactIdentityMatch(
  row: Record<string, unknown>,
  lead?: { external_user_id?: string | null } | null
): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) ids.add(v.trim());
  };
  add(lead?.external_user_id);
  add(row.provider_external_user_id);
  add(row.providerExternalUserId);
  add(row.external_user_id);
  add(row.externalUserId);
  return [...ids];
}

/**
 * Flattens nested `contacts.contact_identities` onto the row for DTO mapping.
 * Matches identity when channel matches and external_user_id equals any known participant id.
 */
export function flattenContactIdentityFields(row: Record<string, unknown>): void {
  const leadRaw = row.leads as { external_user_id?: string } | { external_user_id?: string }[] | undefined;
  const leadObj = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw;
  const extIds = new Set(externalUserIdsForContactIdentityMatch(row, leadObj));
  const channel = pickTrimmedString(row.channel_type, row.channelType);
  const rawIdentities = (row.contacts as { contact_identities?: unknown } | undefined)?.contact_identities as
    | ContactIdentityJoinRow[]
    | ContactIdentityJoinRow
    | undefined;
  const identities = Array.isArray(rawIdentities) ? rawIdentities : rawIdentities ? [rawIdentities] : [];
  let identityDisplay: string | null = null;
  let identityImage: string | null = null;
  if (identities.length > 0 && extIds.size > 0 && channel) {
    const match = identities.find(
      (i) =>
        i.channel_type === channel &&
        typeof i.external_user_id === "string" &&
        extIds.has(i.external_user_id.trim())
    );
    identityDisplay = match?.display_name ?? null;
    identityImage = match?.profile_image_url ?? null;
  }
  row.contactIdentityDisplayName = identityDisplay;
  row.contactIdentityProfileImageUrl = identityImage;
}

/**
 * Resolve a safe HTTPS participant profile image URL from a conversation list row shape.
 * Order: conversation snapshot → matched identity → contact profile.
 */
export function resolveParticipantProfileImageUrl(row: Record<string, unknown>): string | null {
  flattenContactIdentityFields(row);
  const contacts = row.contacts as { profile_image_url?: string | null } | null;
  return pickHttpsProfileImageUrl(
    pickTrimmedString(row.participant_profile_image_url, row.participantProfileImageUrl),
    pickTrimmedString(row.contactIdentityProfileImageUrl, row.contact_identity_profile_image_url),
    typeof contacts?.profile_image_url === "string" ? contacts.profile_image_url : null
  );
}
