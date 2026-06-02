import pino from "pino";
import type { QueuePort } from "../../domain/ports.js";
import { pickHttpsProfileImageUrl } from "../../lib/contactIdentityFlatten.js";
import { PROFILE_AVATAR_CACHE_TOPIC, isProfileAvatarCacheEnabled } from "../../lib/profileAvatarCacheCommon.js";
import { hashProfileImageSourceUrl } from "../../lib/profileAvatarCache.js";
import type { ProfileAvatarCachePayload } from "./profileAvatarCachePayload.js";

const logger = pino({ name: "profile-avatar-cache-enqueue" });

export type ProfileAvatarCacheEnqueueSkipReason =
  | "feature_disabled"
  | "no_source_url"
  | "missing_contact_identity_id"
  | "enqueue_callback_missing";

function trimUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Prefer payload-time URL; fall back to identity profile_image_url from DB upsert. */
export function resolveProfileAvatarCacheSourceUrl(input: {
  payloadProfileImageUrl?: string | null;
  identityProfileImageUrl?: string | null;
}): string | null {
  return pickHttpsProfileImageUrl(trimUrl(input.payloadProfileImageUrl), trimUrl(input.identityProfileImageUrl));
}

export async function enqueueProfileAvatarCache(
  queue: QueuePort,
  input: {
    tenantId: string;
    contactIdentityId: string;
    sourceProfileImageUrl: string;
  }
): Promise<void> {
  if (!isProfileAvatarCacheEnabled()) return;
  const sourceProfileImageUrl = input.sourceProfileImageUrl.trim();
  if (!sourceProfileImageUrl) return;

  const sourceUrlHash = hashProfileImageSourceUrl(sourceProfileImageUrl);
  const payload: ProfileAvatarCachePayload = {
    tenantId: input.tenantId,
    contactIdentityId: input.contactIdentityId,
    sourceProfileImageUrl
  };

  await queue.enqueue(PROFILE_AVATAR_CACHE_TOPIC, payload, {
    tenantId: input.tenantId,
    idempotencyKey: `${PROFILE_AVATAR_CACHE_TOPIC}:${input.contactIdentityId}:${sourceUrlHash}`
  });
}

export async function scheduleProfileAvatarCacheEnqueue(
  enqueue: ((input: {
    tenantId: string;
    contactIdentityId: string;
    sourceProfileImageUrl: string;
  }) => Promise<void>) | undefined,
  input: {
    tenantId: string;
    contactIdentityId: string | null;
    payloadProfileImageUrl?: string | null;
    identityProfileImageUrl?: string | null;
    channel?: string;
    externalMessageId?: string | null;
  }
): Promise<void> {
  const logBase = {
    tenantId: input.tenantId,
    channel: input.channel ?? null,
    externalMessageId: input.externalMessageId ?? null,
    contactIdentityId: input.contactIdentityId
  };

  if (!enqueue) {
    logger.debug({ ...logBase, skipReason: "enqueue_callback_missing" }, "profile_avatar_cache_enqueue_skipped");
    return;
  }

  if (!isProfileAvatarCacheEnabled()) {
    logger.info({ ...logBase, skipReason: "feature_disabled" }, "profile_avatar_cache_enqueue_skipped");
    return;
  }

  if (!input.contactIdentityId) {
    logger.info(
      { ...logBase, skipReason: "missing_contact_identity_id" },
      "profile_avatar_cache_enqueue_skipped"
    );
    return;
  }

  const sourceProfileImageUrl = resolveProfileAvatarCacheSourceUrl({
    payloadProfileImageUrl: input.payloadProfileImageUrl,
    identityProfileImageUrl: input.identityProfileImageUrl
  });

  if (!sourceProfileImageUrl) {
    logger.info({ ...logBase, skipReason: "no_source_url" }, "profile_avatar_cache_enqueue_skipped");
    return;
  }

  try {
    await enqueue({
      tenantId: input.tenantId,
      contactIdentityId: input.contactIdentityId,
      sourceProfileImageUrl
    });
    logger.info(
      {
        ...logBase,
        source: trimUrl(input.payloadProfileImageUrl) ? "payload" : "identity"
      },
      "profile_avatar_cache_enqueued"
    );
  } catch (error) {
    logger.warn(
      {
        ...logBase,
        skipReason: "enqueue_failed",
        error: String(error)
      },
      "profile_avatar_cache_enqueue_failed"
    );
  }
}
