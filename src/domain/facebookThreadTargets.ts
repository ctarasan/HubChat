const FACEBOOK_COMMENT_ID_PATTERN = /^\d+_\d+$/;

export function isFacebookCommentThreadTarget(channelThreadId: string | null | undefined): boolean {
  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("comment:")) return true;
  if (trimmed.startsWith("post:")) return true;
  if (FACEBOOK_COMMENT_ID_PATTERN.test(trimmed)) return true;
  return trimmed.includes("_");
}

export function isValidFacebookMessengerSendTarget(
  channelThreadId: string | null | undefined,
  providerExternalUserId?: string | null,
  options?: { allowRawPsid?: boolean }
): boolean {
  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return false;
  if (isFacebookCommentThreadTarget(trimmed)) return false;

  if (trimmed.startsWith("user:")) {
    return trimmed.slice(5).trim().length > 0;
  }

  if (!options?.allowRawPsid) return false;
  if (trimmed.length === 0) return false;
  if (providerExternalUserId && providerExternalUserId.trim().length > 0) {
    return trimmed === providerExternalUserId.trim();
  }
  return true;
}

export function normalizeFacebookMessengerThreadTarget(
  channelThreadId: string | null | undefined,
  providerExternalUserId?: string | null
): string | null {
  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("user:")) {
    const id = trimmed.slice(5).trim();
    return id ? `user:${id}` : null;
  }
  const external = (providerExternalUserId ?? "").trim();
  if (trimmed && external && trimmed === external) {
    return `user:${external}`;
  }
  return null;
}

/** Numeric Messenger PSID for Send API `recipient.id`. Prefers provider_external_user_id over channel_thread_id. */
export function resolveFacebookMessengerRecipientPsid(
  channelThreadId: string | null | undefined,
  providerExternalUserId?: string | null
): string | null {
  const external = (providerExternalUserId ?? "").trim();
  if (external.length > 0 && /^\d+$/.test(external)) {
    return external;
  }

  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return null;

  const fromThread = trimmed.startsWith("user:") ? trimmed.slice(5).trim() : trimmed;
  if (!fromThread) return null;
  if (isFacebookCommentThreadTarget(fromThread)) return null;
  if (fromThread.includes("_") || fromThread.startsWith("comment:")) return null;

  return fromThread;
}
