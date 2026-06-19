import {
  MEDIA_META_IMAGE_MAX_BYTES,
  isHttpsMediaUrl,
  isUnsafeMediaHost
} from "./mediaPolicy.js";

/** Official Instagram Login image MIME types (jpeg/png only; webp deferred). */
export const INSTAGRAM_OAUTH_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export type InstagramOAuthImageMimeType = (typeof INSTAGRAM_OAUTH_IMAGE_MIME_TYPES)[number];

const INSTAGRAM_OAUTH_IMAGE_MIME_SET = new Set<string>(INSTAGRAM_OAUTH_IMAGE_MIME_TYPES);

export const INSTAGRAM_OAUTH_IMAGE_URL_MAX_LENGTH = 4096;

const DISALLOWED_URL_SCHEMES = /^(data:|file:|javascript:)/i;

const PROFILE_OR_THUMBNAIL_PATH =
  /(?:^|\/)(?:profile[_-]?pic|profilepicture|avatar|source[_-]?post[_-]?thumb|thumbnail)(?:\/|$|[?#])/i;

export type InstagramOAuthImageValidationErrorCode =
  | "IMAGE_URL_INVALID"
  | "UNSUPPORTED_MEDIA"
  | "MEDIA_TOO_LARGE";

export class InstagramOAuthImageDeliveryValidationError extends Error {
  override readonly name = "InstagramOAuthImageDeliveryValidationError";

  constructor(
    message: string,
    readonly code: InstagramOAuthImageValidationErrorCode
  ) {
    super(message);
  }
}

export function maskInstagramOAuthImageUrlForLog(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl);
    const path = parsed.pathname.length > 48 ? `${parsed.pathname.slice(0, 48)}…` : parsed.pathname;
    return `${parsed.protocol}//${parsed.hostname}${path}`;
  } catch {
    return "[invalid-url]";
  }
}

export function validateInstagramOAuthImageDeliveryMedia(input: {
  imageUrl: string;
  mediaMimeType?: string | null;
  fileSizeBytes?: number | null;
}): { imageUrl: string; urlHost: string } {
  const rawUrl = input.imageUrl.trim();
  if (!rawUrl) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL is required.",
      "IMAGE_URL_INVALID"
    );
  }
  if (rawUrl.length > INSTAGRAM_OAUTH_IMAGE_URL_MAX_LENGTH) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL exceeds maximum length.",
      "IMAGE_URL_INVALID"
    );
  }
  if (DISALLOWED_URL_SCHEMES.test(rawUrl)) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL must use HTTPS.",
      "IMAGE_URL_INVALID"
    );
  }
  if (!isHttpsMediaUrl(rawUrl)) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL must be a valid HTTPS link.",
      "IMAGE_URL_INVALID"
    );
  }
  if (isUnsafeMediaHost(rawUrl)) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL host is not allowed.",
      "IMAGE_URL_INVALID"
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL is malformed.",
      "IMAGE_URL_INVALID"
    );
  }
  if (parsed.username || parsed.password) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL must not contain embedded credentials.",
      "IMAGE_URL_INVALID"
    );
  }
  if (PROFILE_OR_THUMBNAIL_PATH.test(`${parsed.pathname}${parsed.search}`)) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image URL must not use profile or thumbnail assets.",
      "IMAGE_URL_INVALID"
    );
  }

  const mime = typeof input.mediaMimeType === "string" ? input.mediaMimeType.trim().toLowerCase() : "";
  if (!mime || !INSTAGRAM_OAUTH_IMAGE_MIME_SET.has(mime)) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth images must be JPEG or PNG.",
      "UNSUPPORTED_MEDIA"
    );
  }
  if (
    typeof input.fileSizeBytes === "number" &&
    Number.isFinite(input.fileSizeBytes) &&
    input.fileSizeBytes > MEDIA_META_IMAGE_MAX_BYTES
  ) {
    throw new InstagramOAuthImageDeliveryValidationError(
      "Instagram OAuth image exceeds Meta URL attachment size limit.",
      "MEDIA_TOO_LARGE"
    );
  }

  return { imageUrl: rawUrl, urlHost: parsed.hostname };
}
