import type { QueuePort } from "../../domain/ports.js";
import { PROFILE_AVATAR_CACHE_TOPIC, isProfileAvatarCacheEnabled } from "../../lib/profileAvatarCacheCommon.js";
import { hashProfileImageSourceUrl } from "../../lib/profileAvatarCache.js";
import type { ProfileAvatarCachePayload } from "./profileAvatarCachePayload.js";

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
