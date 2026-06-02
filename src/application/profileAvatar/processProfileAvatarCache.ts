import pino from "pino";
import { ProfileAvatarCacheService } from "../../infrastructure/media/profileAvatarCacheService.js";
import type { SupabaseProfileAvatarRepository } from "../../infrastructure/adapters/repositories/supabaseProfileAvatarRepository.js";
import type { ProfileAvatarCachePayload } from "./profileAvatarCachePayload.js";
import { isProfileAvatarCacheEnabled } from "../../lib/profileAvatarCacheCommon.js";
import { hashProfileImageSourceUrl, mapCacheStatusForDb } from "../../lib/profileAvatarCache.js";

const logger = pino({ name: "process-profile-avatar-cache" });

export type ProcessProfileAvatarCacheResult = {
  retryable: boolean;
};

export class ProcessProfileAvatarCacheUseCase {
  constructor(
    private readonly repo: SupabaseProfileAvatarRepository,
    private readonly cacheService: ProfileAvatarCacheService
  ) {}

  async execute(payload: ProfileAvatarCachePayload): Promise<ProcessProfileAvatarCacheResult> {
    if (!isProfileAvatarCacheEnabled()) {
      return { retryable: false };
    }

    const identity = await this.repo.findIdentityForCache(payload.tenantId, payload.contactIdentityId);
    if (!identity) {
      logger.warn(
        { tenantId: payload.tenantId, contactIdentityId: payload.contactIdentityId },
        "profile avatar cache identity not found"
      );
      return { retryable: false };
    }

    const sourceUrl = payload.sourceProfileImageUrl.trim();
    if (!sourceUrl) {
      await this.repo.updateIdentityCacheFields({
        tenantId: payload.tenantId,
        contactIdentityId: payload.contactIdentityId,
        status: "failed",
        cachedPath: null,
        cachedAt: null
      });
      return { retryable: false };
    }

    if (this.cacheService.shouldSkipDownload(identity, sourceUrl)) {
      await this.repo.updateIdentityCacheFields({
        tenantId: payload.tenantId,
        contactIdentityId: payload.contactIdentityId,
        status: "skipped",
        sourceUrlHash: identity.profile_image_source_url_hash
      });
      return { retryable: false };
    }

    await this.repo.markIdentityPending({
      tenantId: payload.tenantId,
      contactIdentityId: payload.contactIdentityId,
      sourceUrlHash: hashProfileImageSourceUrl(sourceUrl)
    });

    const result = await this.cacheService.cacheFromSourceUrl({
      tenantId: payload.tenantId,
      contactIdentityId: payload.contactIdentityId,
      sourceUrl,
      identity
    });

    if (result.outcome === "skipped") {
      return { retryable: false };
    }

    if (result.outcome === "ok") {
      const now = new Date();
      await this.repo.updateIdentityCacheFields({
        tenantId: payload.tenantId,
        contactIdentityId: payload.contactIdentityId,
        status: "ok",
        cachedPath: result.storagePath,
        cachedAt: now,
        sourceUrlHash: result.sourceUrlHash
      });
      if (identity.contact_id) {
        await this.repo.denormalizeCachedAvatar({
          tenantId: payload.tenantId,
          contactId: String(identity.contact_id),
          publicUrl: result.publicUrl
        });
      }
      return { retryable: false };
    }

    await this.repo.updateIdentityCacheFields({
      tenantId: payload.tenantId,
      contactIdentityId: payload.contactIdentityId,
      status: mapCacheStatusForDb(result.outcome),
      cachedPath: null,
      cachedAt: null,
      sourceUrlHash: result.sourceUrlHash
    });

    logger.info(
      {
        tenantId: payload.tenantId,
        contactIdentityId: payload.contactIdentityId,
        reason: result.reason,
        retryable: result.retryable
      },
      "profile avatar cache failed"
    );

    return { retryable: result.retryable };
  }
}
