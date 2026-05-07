type EnvMap = Record<string, string | undefined>;

function pickString(row: any, snake: string, camel: string): string {
  const v = row?.[snake] ?? row?.[camel];
  return typeof v === "string" ? v.trim() : "";
}

function parseCsvSet(value: string | undefined, normalize: (input: string) => string = (x) => x): Set<string> {
  if (!value || !value.trim()) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((v) => normalize(v.trim()))
      .filter((v) => v.length > 0)
  );
}

function normalizeIdentity(value: string): string {
  const v = value.trim();
  if (v.startsWith("ig:user:")) return v.slice("ig:user:".length).trim();
  if (v.startsWith("user:")) return v.slice("user:".length).trim();
  return v;
}

export function filterOwnPlatformAccountConversations(rows: any[], env: EnvMap = process.env): any[] {
  const ownInstagramIds = new Set(
    [
      env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      env.INSTAGRAM_ACCOUNT_ID,
      env.INSTAGRAM_PAGE_ID
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
  );
  const ownFacebookPageId = (env.FACEBOOK_PAGE_ID ?? "").trim();
  const explicitSelfIds = parseCsvSet(env.INBOX_SELF_EXTERNAL_IDS, normalizeIdentity);
  const explicitSelfNames = parseCsvSet(env.INBOX_SELF_DISPLAY_NAMES, (x) => x.toLowerCase());
  if (!ownFacebookPageId && ownInstagramIds.size === 0 && explicitSelfIds.size === 0 && explicitSelfNames.size === 0) return rows;

  return rows.filter((row) => {
    const channel = pickString(row, "channel_type", "channelType").toUpperCase();
    const providerExternalUserId = normalizeIdentity(pickString(row, "provider_external_user_id", "providerExternalUserId"));
    const externalUserId = normalizeIdentity(pickString(row, "external_user_id", "externalUserId"));
    const providerPageId = normalizeIdentity(pickString(row, "provider_page_id", "providerPageId"));
    const rawChannelThreadId = pickString(row, "channel_thread_id", "channelThreadId");
    const channelThreadId = normalizeIdentity(rawChannelThreadId);
    const participantDisplayName = (
      pickString(row, "participant_display_name", "participantDisplayName") ||
      pickString(row, "display_name", "displayName")
    ).toLowerCase();
    if (participantDisplayName && explicitSelfNames.has(participantDisplayName)) return false;

    if (channel === "INSTAGRAM") {
      const ids = new Set([providerExternalUserId, externalUserId].filter(Boolean));
      for (const id of ids) {
        if (ownInstagramIds.has(id) || (ownFacebookPageId && id === ownFacebookPageId) || explicitSelfIds.has(id)) return false;
      }
      if (providerPageId && ids.has(providerPageId)) return false;
      if (providerPageId && rawChannelThreadId === `ig:user:${providerPageId}`) return false;
      if (channelThreadId && explicitSelfIds.has(channelThreadId)) return false;
      return true;
    }

    if (channel === "FACEBOOK") {
      if (explicitSelfIds.size === 0 && explicitSelfNames.size === 0) return true;
      if (explicitSelfIds.has(externalUserId) || explicitSelfIds.has(channelThreadId)) return false;
      return true;
    }

    return true;
  });
}

