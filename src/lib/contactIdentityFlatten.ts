import {
  buildProfileAvatarPublicUrl,
  identityHasProfileAvatarCacheMetadata,
  isProfileAvatarCacheEnabled,
  type ProfileAvatarCacheStatus
} from "./profileAvatarCacheCommon.js";

export type ContactIdentityJoinRow = {
  channel_type?: string;
  external_user_id?: string;
  display_name?: string | null;
  profile_image_url?: string | null;
  profile_image_cached_path?: string | null;
  profile_image_cache_status?: string | null;
};

function normalizeProfileImageUrlCandidate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = t.startsWith("//") ? `https:${t}` : t;
  try {
    if (new URL(withScheme).protocol === "https:") return withScheme;
  } catch {
    return null;
  }
  return null;
}

/** Accept only absolute HTTPS image URLs (matches Dashboard avatar policy). */
export function pickHttpsProfileImageUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const normalized = normalizeProfileImageUrlCandidate(c);
    if (normalized) return normalized;
  }
  return null;
}

function pickTrimmedString(...values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickCacheStatus(row: Record<string, unknown>): ProfileAvatarCacheStatus | null {
  const raw = pickTrimmedString(
    row.contactIdentityProfileImageCacheStatus,
    row.contact_identity_profile_image_cache_status,
    row.profile_image_cache_status,
    row.profileImageCacheStatus
  );
  if (raw === "pending" || raw === "ok" || raw === "failed" || raw === "skipped") return raw;
  return null;
}

function pickCachedStoragePath(row: Record<string, unknown>): string | null {
  return pickTrimmedString(
    row.contactIdentityProfileImageCachedPath,
    row.contact_identity_profile_image_cached_path,
    row.profile_image_cached_path,
    row.profileImageCachedPath
  );
}

function rowHasIdentityCacheMetadata(row: Record<string, unknown>): boolean {
  if (
    identityHasProfileAvatarCacheMetadata({
      profile_image_cache_status: pickCacheStatus(row),
      profile_image_cached_path: pickCachedStoragePath(row)
    })
  ) {
    return true;
  }
  const contacts = normalizeContactsJoin(row.contacts);
  const rawIdentities = contacts?.contact_identities as ContactIdentityJoinRow[] | ContactIdentityJoinRow | undefined;
  const identities = Array.isArray(rawIdentities) ? rawIdentities : rawIdentities ? [rawIdentities] : [];
  return identities.some((i) => identityHasProfileAvatarCacheMetadata(i));
}

/** Cached Supabase public URL from identity cache columns (wins over provider CDN snapshots). */
export function resolveCachedProfileImagePublicUrl(row: Record<string, unknown>): string | null {
  const status = pickCacheStatus(row);
  const path = pickCachedStoragePath(row);
  if (!path) return null;
  if (status === "ok") return buildProfileAvatarPublicUrl(path);
  if (status === "pending") return buildProfileAvatarPublicUrl(path);
  return null;
}

function shouldSuppressProviderProfileUrls(row: Record<string, unknown>): boolean {
  if (!isProfileAvatarCacheEnabled()) return false;
  if (!rowHasIdentityCacheMetadata(row)) return false;
  const status = pickCacheStatus(row);
  if (status === "ok") return false;
  return true;
}

/** IGSID / PSID-style ids embedded in conversation thread keys (Inbox list rows). */
export function participantExternalUserIdsFromChannelThread(
  channel: string | null,
  channelThreadId: string | null | undefined
): string[] {
  const thread = typeof channelThreadId === "string" ? channelThreadId.trim() : "";
  if (!thread || !channel) return [];
  const out: string[] = [];
  if (channel === "INSTAGRAM" && thread.startsWith("ig:user:")) {
    const igsid = thread.slice("ig:user:".length).trim();
    if (/^\d+$/.test(igsid)) out.push(igsid);
  }
  if (channel === "FACEBOOK" || channel === "INSTAGRAM") {
    if (thread.startsWith("user:")) {
      const psid = thread.slice("user:".length).trim();
      if (psid) out.push(psid);
    }
    if (/^\d+$/.test(thread)) out.push(thread);
  }
  return out;
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
  const channel = pickTrimmedString(row.channel_type, row.channelType);
  for (const id of participantExternalUserIdsFromChannelThread(
    channel,
    pickTrimmedString(row.channel_thread_id, row.channelThreadId)
  )) {
    ids.add(id);
  }
  return [...ids];
}

function normalizeContactsJoin(
  contacts: unknown
): { display_name?: string | null; profile_image_url?: string | null; contact_identities?: unknown } | null {
  if (!contacts || typeof contacts !== "object") return null;
  if (Array.isArray(contacts)) {
    const first = contacts[0];
    return first && typeof first === "object"
      ? (first as {
          display_name?: string | null;
          profile_image_url?: string | null;
          contact_identities?: unknown;
        })
      : null;
  }
  return contacts as {
    display_name?: string | null;
    profile_image_url?: string | null;
    contact_identities?: unknown;
  };
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
  const contactsJoin = normalizeContactsJoin(row.contacts);
  if (contactsJoin && contactsJoin !== row.contacts) {
    row.contacts = contactsJoin;
  }
  const rawIdentities = contactsJoin?.contact_identities as
    | ContactIdentityJoinRow[]
    | ContactIdentityJoinRow
    | undefined;
  const identities = Array.isArray(rawIdentities) ? rawIdentities : rawIdentities ? [rawIdentities] : [];
  let identityDisplay: string | null = null;
  let identityImage: string | null = null;
  let identityCacheStatus: string | null = null;
  let identityCachedPath: string | null = null;
  if (identities.length > 0 && channel) {
    let match: ContactIdentityJoinRow | undefined;
    if (extIds.size > 0) {
      match = identities.find(
        (i) =>
          i.channel_type === channel &&
          typeof i.external_user_id === "string" &&
          extIds.has(i.external_user_id.trim())
      );
    }
    if (!match) {
      const forChannel = identities.filter((i) => i.channel_type === channel);
      if (forChannel.length === 1) match = forChannel[0];
    }
    identityDisplay = match?.display_name ?? null;
    identityImage = match?.profile_image_url ?? null;
    identityCacheStatus = match?.profile_image_cache_status ?? null;
    identityCachedPath = match?.profile_image_cached_path ?? null;
  }
  row.contactIdentityDisplayName = identityDisplay;
  row.contactIdentityProfileImageUrl = identityImage;
  row.contactIdentityProfileImageCacheStatus = identityCacheStatus;
  row.contactIdentityProfileImageCachedPath = identityCachedPath;
}

/**
 * Resolve a safe HTTPS participant profile image URL from a conversation list row shape.
 * Order: cached Supabase URL (ok/pending) → legacy provider URLs when cache disabled/unset → null when cache failed/skipped.
 */
export function resolveParticipantProfileImageUrl(row: Record<string, unknown>): string | null {
  flattenContactIdentityFields(row);

  const cached = resolveCachedProfileImagePublicUrl(row);
  if (cached) return cached;

  if (shouldSuppressProviderProfileUrls(row)) {
    return null;
  }

  const contacts = normalizeContactsJoin(row.contacts);
  return pickHttpsProfileImageUrl(
    pickTrimmedString(row.participant_profile_image_url, row.participantProfileImageUrl),
    pickTrimmedString(row.contactIdentityProfileImageUrl, row.contact_identity_profile_image_url),
    typeof contacts?.profile_image_url === "string" ? contacts.profile_image_url : null
  );
}
