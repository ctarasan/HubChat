import { sanitizeSourcePostSnippet } from "../domain/sourcePostContext.js";

/** Allowlisted metadata keys for parent post text (never read whole metadata blobs). */
export const SOURCE_POST_TEXT_METADATA_KEYS = [
  "source_post_snippet",
  "sourcePostSnippet",
  "source_post_message",
  "sourcePostMessage",
  "source_post_text",
  "sourcePostText",
  "post_message",
  "postMessage",
  "post_caption",
  "postCaption",
  "post_snippet",
  "postSnippet",
  "post_text",
  "postText",
  "parent_post_message",
  "parentPostMessage",
  "parent_post_caption",
  "parentPostCaption"
] as const;

const BLOCKED_METADATA_KEYS = new Set([
  "rawPayload",
  "raw_payload",
  "graphCommentDetail",
  "graph_comment_detail",
  "providerPayload",
  "provider_payload",
  "permalinkUrl",
  "permalink_url",
  "access_token",
  "accessToken",
  "page_access_token",
  "secret_json",
  "commentId",
  "comment_id",
  "parentId",
  "parent_id",
  "mediaId",
  "media_id",
  "provider_page_id",
  "providerPageId",
  "provider_thread_id",
  "providerThreadId"
]);

const TOKEN_PATTERNS = [
  /\bEA[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+\S+/i,
  /\baccess_token[=:]\s*\S+/i
];

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeToken(value: string): boolean {
  return TOKEN_PATTERNS.some((pattern) => pattern.test(value));
}

function isBlockedMetadataKey(key: string): boolean {
  if (BLOCKED_METADATA_KEYS.has(key)) return true;
  const lower = key.toLowerCase();
  return (
    lower.includes("raw") ||
    lower.includes("payload") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("provider") ||
    lower.includes("psid") ||
    lower.includes("igsid") ||
    lower.includes("permalink")
  );
}

/**
 * Extract safe parent post text from a single metadata object using allowlisted keys only.
 * Returns null when no safe text is found.
 */
export function extractSourcePostTextFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;

  for (const key of SOURCE_POST_TEXT_METADATA_KEYS) {
    if (isBlockedMetadataKey(key)) continue;
    const raw = normalizeString(metadata[key]);
    if (!raw || looksLikeJson(raw) || looksLikeUrl(raw) || looksLikeToken(raw)) continue;
    const sanitized = sanitizeSourcePostSnippet(raw);
    if (sanitized) return sanitized;
  }

  return null;
}
