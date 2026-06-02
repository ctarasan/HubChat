export const PROFILE_AVATAR_CACHE_TOPIC = "profile.avatar.cache" as const;

export type ProfileAvatarCacheStatus = "pending" | "ok" | "failed" | "skipped";

export const PROFILE_AVATAR_CACHE_STATUSES: readonly ProfileAvatarCacheStatus[] = [
  "pending",
  "ok",
  "failed",
  "skipped"
];

export function isProfileAvatarCacheEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.HUBCHAT_PROFILE_AVATAR_CACHE_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function profileAvatarBucketName(env: Record<string, string | undefined> = process.env): string {
  return env.HUBCHAT_PROFILE_AVATAR_BUCKET?.trim() || "profile-avatars";
}

export function buildProfileAvatarStoragePath(tenantId: string, contactIdentityId: string): string {
  return `${tenantId}/avatars/${contactIdentityId}.jpg`;
}

export function buildProfileAvatarPublicUrl(
  storagePath: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): string | null {
  if (!storagePath?.trim()) return null;
  const base = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  const bucket = profileAvatarBucketName(env);
  const encoded = storagePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export function identityHasProfileAvatarCacheMetadata(row: {
  profile_image_cache_status?: string | null;
  profileImageCacheStatus?: string | null;
  profile_image_cached_path?: string | null;
  profileImageCachedPath?: string | null;
}): boolean {
  const status =
    typeof row.profile_image_cache_status === "string"
      ? row.profile_image_cache_status
      : typeof row.profileImageCacheStatus === "string"
        ? row.profileImageCacheStatus
        : null;
  const path =
    typeof row.profile_image_cached_path === "string"
      ? row.profile_image_cached_path
      : typeof row.profileImageCachedPath === "string"
        ? row.profileImageCachedPath
        : null;
  return Boolean(status?.trim() || path?.trim());
}
