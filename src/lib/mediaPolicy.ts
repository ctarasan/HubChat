export type MediaOutboundChannel = "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";

/** Max bytes accepted by outbound upload routes (images and PDFs). */
export const MEDIA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Meta (Facebook / Instagram) URL-based image attachment limit. */
export const MEDIA_META_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Max file size validated on SendMessageSchema (aligned with upload cap). */
export const MEDIA_SEND_MAX_FILE_BYTES = MEDIA_UPLOAD_MAX_BYTES;

export const OUTBOUND_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type OutboundImageMimeType = (typeof OUTBOUND_IMAGE_MIME_TYPES)[number];

export const OUTBOUND_IMAGE_MIME_SET = new Set<string>(OUTBOUND_IMAGE_MIME_TYPES);

export const OUTBOUND_PDF_MIME = "application/pdf";

/** Minimum signed URL TTL for Supabase Storage (1 hour). */
export const MEDIA_SIGNED_URL_TTL_MIN_SEC = 3600;

/** Default outbound agent-upload signed URL TTL (30 days). */
export const MEDIA_OUTBOUND_SIGNED_URL_DEFAULT_TTL_SEC = 60 * 60 * 24 * 30;

/** Default inbound LINE processed media signed URL TTL (7 days). */
export const MEDIA_INBOUND_SIGNED_URL_DEFAULT_TTL_SEC = 60 * 60 * 24 * 7;

/** Storage object cache-control for uploads (1 year). */
export const MEDIA_STORAGE_CACHE_CONTROL_SEC = 31_536_000;

/**
 * Future lifecycle recommendations (documentation only — not enforced in P3).
 * Implement retention/cleanup in a later phase with bucket policies or scheduled jobs.
 */
export const MEDIA_RETENTION_POLICY_RECOMMENDATIONS = {
  originalMediaRetentionDays: 90,
  thumbnailRetentionDays: 180,
  outboundSignedUrlTtlSec: MEDIA_OUTBOUND_SIGNED_URL_DEFAULT_TTL_SEC,
  inboundSignedUrlTtlSec: MEDIA_INBOUND_SIGNED_URL_DEFAULT_TTL_SEC,
  maxUploadBytes: MEDIA_UPLOAD_MAX_BYTES,
  maxMetaImageBytes: MEDIA_META_IMAGE_MAX_BYTES,
  auditLogRetentionDays: 30
} as const;

export type MessageMediaUrls = {
  /** Thumbnail / inline timeline preview (prefer smaller asset). */
  previewUrl: string | null;
  /** User download / provider send URL (full asset or PDF link). */
  downloadUrl: string | null;
  /** Alias for full-resolution when distinct from download. */
  originalUrl: string | null;
};

export function toPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n < MEDIA_SIGNED_URL_TTL_MIN_SEC) return MEDIA_SIGNED_URL_TTL_MIN_SEC;
  return Math.floor(n);
}

export function resolveOutboundSignedUrlTtlSec(
  raw: string | undefined = process.env.MESSAGE_IMAGE_SIGNED_URL_TTL_SEC ??
    process.env.MESSAGE_FILE_SIGNED_URL_TTL_SEC
): number {
  return toPositiveInt(raw, MEDIA_OUTBOUND_SIGNED_URL_DEFAULT_TTL_SEC);
}

export function resolveInboundSignedUrlTtlSec(
  raw: string | undefined = process.env.INBOUND_MEDIA_SIGNED_URL_TTL_SEC
): number {
  return toPositiveInt(raw, MEDIA_INBOUND_SIGNED_URL_DEFAULT_TTL_SEC);
}

export function formatUploadTooLargeError(kind: "image" | "pdf"): string {
  const mb = Math.floor(MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024));
  return kind === "image"
    ? `file is too large (max ${mb}MB)`
    : `file is too large (max ${mb}MB)`;
}

export function formatChannelImageTooLargeError(channel: "FACEBOOK" | "INSTAGRAM"): string {
  const mb = Math.floor(MEDIA_META_IMAGE_MAX_BYTES / (1024 * 1024));
  return channel === "FACEBOOK"
    ? `Facebook Messenger image outbound supports up to ${mb}MB for URL-based attachment`
    : `Instagram DM image outbound supports up to ${mb}MB`;
}

export function isAllowedOutboundImageMime(mimeType: string): boolean {
  return OUTBOUND_IMAGE_MIME_SET.has(mimeType.trim().toLowerCase());
}

export function isUnsafeMediaHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|.+\.local$)/i.test(host);
  } catch {
    return true;
  }
}

export function isHttpsMediaUrl(url: string | undefined | null): boolean {
  if (!url?.trim()) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve preview vs download/original URLs for timeline and providers. */
export function resolveMessageMediaUrls(input: {
  messageType?: string | null;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  metadataJson?: Record<string, unknown> | null;
}): MessageMediaUrls {
  const meta = input.metadataJson ?? {};
  const columnMedia = trimUrl(input.mediaUrl);
  const columnPreview = trimUrl(input.previewUrl);
  const metaThumb = trimUrl(meta.thumbnailUrl);
  const metaPreview = trimUrl(meta.previewUrl);
  const metaMedia = trimUrl(meta.mediaUrl);
  const metaFull = trimUrl(meta.fullImageUrl);

  const originalUrl = columnMedia ?? metaFull ?? metaMedia;
  const fallbackPreview = metaThumb ?? metaPreview ?? columnPreview ?? null;
  const downloadUrl =
    input.messageType === "DOCUMENT_PDF" ? originalUrl : originalUrl ?? fallbackPreview;

  let previewUrl: string | null = null;
  for (const candidate of [metaThumb, metaPreview, columnPreview]) {
    if (candidate && candidate !== downloadUrl) {
      previewUrl = candidate;
      break;
    }
  }

  return {
    previewUrl,
    downloadUrl,
    originalUrl
  };
}

function trimUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateChannelMediaFileSize(input: {
  channel: MediaOutboundChannel;
  messageType: "image" | "document_pdf";
  fileSizeBytes?: number;
}): string | null {
  if (typeof input.fileSizeBytes !== "number") return null;
  if (input.fileSizeBytes > MEDIA_SEND_MAX_FILE_BYTES) {
    const mb = Math.floor(MEDIA_SEND_MAX_FILE_BYTES / (1024 * 1024));
    return `Attachment exceeds upload limit (${mb}MB)`;
  }
  if (
    input.messageType === "image" &&
    (input.channel === "FACEBOOK" || input.channel === "INSTAGRAM") &&
    input.fileSizeBytes > MEDIA_META_IMAGE_MAX_BYTES
  ) {
    return formatChannelImageTooLargeError(input.channel);
  }
  return null;
}

/** Instagram outbound image URL/MIME/size validation (Meta URL attachment rules). */
export function validateInstagramOutboundImageMedia(input: {
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  fileSizeBytes?: number | null;
  requiresHttpsUrlMessage?: string;
  unsupportedMimeMessage?: string;
}): string | null {
  const requiresHttps =
    input.requiresHttpsUrlMessage ?? "Instagram DM image URL must be a valid HTTPS link.";
  const unsupportedMime =
    input.unsupportedMimeMessage ??
    "Instagram DM images must be JPEG, PNG, or WEBP (upload a supported file type).";

  const rawUrl = typeof input.mediaUrl === "string" ? input.mediaUrl.trim() : "";
  if (!rawUrl || !isHttpsMediaUrl(rawUrl)) {
    return requiresHttps;
  }
  const mime = typeof input.mediaMimeType === "string" ? input.mediaMimeType.trim().toLowerCase() : "";
  if (!mime || !isAllowedOutboundImageMime(mime)) {
    return unsupportedMime;
  }
  return validateChannelMediaFileSize({
    channel: "INSTAGRAM",
    messageType: "image",
    fileSizeBytes: typeof input.fileSizeBytes === "number" ? input.fileSizeBytes : undefined
  });
}
