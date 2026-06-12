const BLOCKED_THUMBNAIL_SUBSTRINGS = [
  "profile_pic",
  "profile.php",
  "/picture?",
  "/profile/",
  "profile_pic_url",
  "scontent.cdninstagram.com/v/t51.2885-19/"
] as const;

export function isSafeSourcePostThumbnailUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return false;
  const lower = trimmed.toLowerCase();
  return !BLOCKED_THUMBNAIL_SUBSTRINGS.some((blocked) => lower.includes(blocked));
}

export function sanitizeSourcePostThumbnailUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isSafeSourcePostThumbnailUrl(trimmed) ? trimmed : null;
}
