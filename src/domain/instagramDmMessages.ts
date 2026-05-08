/** User-facing and HubChat-internal strings for Instagram DM (domain layer — safe for use cases + UI). */

/** @deprecated Kept for backward-compat with TEXT+attachment rejection paths. */
export const INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE = "Instagram DM Phase 1 supports text messages only.";

export const INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL = "Instagram DM image URL must be a valid HTTPS link.";
export const INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME =
  "Instagram DM images must be JPEG, PNG, or WEBP (upload a supported file type).";
export const INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE =
  "Instagram DM does not support this media type yet. Send JPEG, PNG, or WEBP images only.";
export const INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT = "Instagram inbound attachment type is not supported yet.";
export const INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED = "Instagram DM does not support PDF attachments yet.";

/**
 * Dashboard sends this `content` when the user attaches an image but does not type a caption.
 * It must not be sent as a separate TEXT message after the image.
 */
export const INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT = "[image]";

/**
 * Caption text to send as a follow-up TEXT message after an outbound image, or null when none.
 * Empty trim and the UI placeholder "[image]" mean no caption follow-up.
 */
export function instagramDmOutboundCaptionToSend(content: string): string | null {
  const t = content.trim();
  if (!t.length) return null;
  if (t === INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT) return null;
  return t;
}
