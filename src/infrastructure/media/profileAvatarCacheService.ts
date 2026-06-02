import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProfileAvatarPublicUrl,
  buildProfileAvatarStoragePath,
  profileAvatarBucketName
} from "../../lib/profileAvatarCacheCommon.js";
import {
  ProfileAvatarFetchError,
  fetchAllowlistedProfileImage,
  hashProfileImageSourceUrl,
  isRetryableProfileAvatarFetchError
} from "../../lib/profileAvatarCache.js";

export type ProfileAvatarCacheRunResult =
  | { outcome: "ok"; storagePath: string; publicUrl: string; sourceUrlHash: string }
  | { outcome: "skipped"; sourceUrlHash: string }
  | { outcome: "failed"; sourceUrlHash: string; retryable: boolean; reason: string };

export type ProfileAvatarIdentityRow = {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  profile_image_url: string | null;
  profile_image_cached_path: string | null;
  profile_image_cache_status: string | null;
  profile_image_source_url_hash: string | null;
};

export class ProfileAvatarCacheService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly deps?: {
      fetchFn?: typeof fetch;
      reencodeToJpeg?: (body: Buffer) => Promise<Buffer>;
    }
  ) {}

  private async reencodeToJpeg(body: Buffer): Promise<Buffer> {
    if (this.deps?.reencodeToJpeg) return this.deps.reencodeToJpeg(body);
    return sharp(body).rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  }

  shouldSkipDownload(identity: ProfileAvatarIdentityRow, sourceUrl: string): boolean {
    const hash = hashProfileImageSourceUrl(sourceUrl);
    return (
      identity.profile_image_cache_status === "ok" &&
      identity.profile_image_source_url_hash === hash &&
      Boolean(identity.profile_image_cached_path?.trim())
    );
  }

  async cacheFromSourceUrl(input: {
    tenantId: string;
    contactIdentityId: string;
    sourceUrl: string;
    identity: ProfileAvatarIdentityRow;
  }): Promise<ProfileAvatarCacheRunResult> {
    const sourceUrl = input.sourceUrl.trim();
    const sourceUrlHash = hashProfileImageSourceUrl(sourceUrl);
    if (!sourceUrl) {
      return { outcome: "failed", sourceUrlHash, retryable: false, reason: "empty_source_url" };
    }

    if (this.shouldSkipDownload(input.identity, sourceUrl)) {
      return { outcome: "skipped", sourceUrlHash };
    }

    const storagePath = buildProfileAvatarStoragePath(input.tenantId, input.contactIdentityId);
    const bucket = profileAvatarBucketName();

    try {
      const fetched = await fetchAllowlistedProfileImage(sourceUrl, { fetchFn: this.deps?.fetchFn });
      const jpeg = await this.reencodeToJpeg(fetched.body);

      const { error: uploadError } = await this.supabase.storage.from(bucket).upload(storagePath, jpeg, {
        contentType: "image/jpeg",
        upsert: true
      });
      if (uploadError) {
        return {
          outcome: "failed",
          sourceUrlHash,
          retryable: true,
          reason: uploadError.message ?? "upload_failed"
        };
      }

      const publicUrl = buildProfileAvatarPublicUrl(storagePath);
      if (!publicUrl) {
        return { outcome: "failed", sourceUrlHash, retryable: false, reason: "public_url_unavailable" };
      }

      return { outcome: "ok", storagePath, publicUrl, sourceUrlHash };
    } catch (error) {
      const reason =
        error instanceof ProfileAvatarFetchError
          ? error.code
          : error instanceof Error
            ? error.message
            : "unknown";
      const retryable = isRetryableProfileAvatarFetchError(error);
      return { outcome: "failed", sourceUrlHash, retryable, reason };
    }
  }
}
