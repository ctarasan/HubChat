/**
 * FPC-1B — Source Post Context card model.
 * Consumes FPC-1A API fields only; never renders provider IDs, tokens, or raw URLs as text.
 *
 * GET /api/conversations conversation list item DTO: nested `source_post_context` / `sourcePostContext`.
 */

import {
  readLeadSourceFieldsFromRow,
  resolveLeadSourceBadge,
  type LeadSourceBadgeKey
} from "./leadSourceBadgeModel.js";

export const SOURCE_POST_CONTEXT_KINDS = [
  "FACEBOOK_COMMENT",
  "FACEBOOK_PRIVATE_REPLY",
  "INSTAGRAM_COMMENT",
  "INSTAGRAM_PRIVATE_REPLY"
] as const;

export type SourcePostContextKind = (typeof SOURCE_POST_CONTEXT_KINDS)[number];

/** FPC-1A `SourcePostContextDto` (snake_case primary; camelCase legacy accepted). */
export type SourcePostContextApiDto = {
  sourceBadgeLabel?: string | null;
  postThumbnailUrl?: string | null;
  postSnippet?: string | null;
  leadComment?: string | null;
  privateReplySent?: boolean;
  openPostAvailable?: boolean;
  openPostHref?: string | null;
  fallbackMessage?: string | null;
  postDetailsAvailable?: boolean;
};

export type SourcePostContextViewModel = {
  kind: SourcePostContextKind;
  sourceBadgeLabel: string;
  postThumbnailUrl: string | null;
  showThumbnailPlaceholder: boolean;
  postSnippet: string | null;
  leadComment: string | null;
  privateReplySent: boolean;
  openPostAvailable: boolean;
  openPostHref: string | null;
  postDetailsAvailable: boolean;
  fallbackMessage: string | null;
  testId: string;
};

const FALLBACK_MESSAGES: Record<SourcePostContextKind, string> = {
  FACEBOOK_COMMENT: "This lead came from a Facebook comment. Post details are not available yet.",
  FACEBOOK_PRIVATE_REPLY:
    "This lead came from a Facebook private reply. Post details are not available yet.",
  INSTAGRAM_COMMENT: "This lead came from an Instagram comment. Post details are not available yet.",
  INSTAGRAM_PRIVATE_REPLY:
    "This lead came from an Instagram private reply. Post details are not available yet."
};

const UNSAFE_TEXT_PATTERNS = [
  /^\d{8,}$/,
  /^\d+_\d+$/,
  /Bearer\s+\S+/i,
  /^https?:\/\//i,
  /provider_page_id/i,
  /provider_thread_id/i,
  /provider_comment_id/i,
  /\bPSID\b/i,
  /\bIGSID\b/i,
  /profile\.php/i,
  /\/profiles?\//i
];

const FORBIDDEN_DOM_PATTERNS = [
  /provider_page_id/i,
  /provider_thread_id/i,
  /provider_comment_id/i,
  /Bearer\s+/i,
  /secret_json/i
];

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSourcePostKind(key: string): key is SourcePostContextKind {
  return (SOURCE_POST_CONTEXT_KINDS as readonly string[]).includes(key);
}

export function isUnsafeSourcePostContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return UNSAFE_TEXT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function truncateSourcePostText(text: string, maxChars = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

export function sanitizeSourcePostText(text: unknown): string | null {
  const raw = normalizeString(text);
  if (!raw || isUnsafeSourcePostContent(raw)) return null;
  return truncateSourcePostText(raw);
}

const UNSAFE_URL_PATTERNS = [
  /Bearer\s+\S+/i,
  /provider_page_id/i,
  /provider_thread_id/i,
  /provider_comment_id/i,
  /profile\.php/i,
  /\/profiles?\//i,
  /profile|avatar|psid|igsid/i
];

function isUnsafeSourcePostUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (/^\d{8,}$/.test(trimmed) || /^\d+_\d+$/.test(trimmed)) return true;
  return UNSAFE_URL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isSafePostThumbnailUrl(url: unknown): boolean {
  const raw = normalizeString(url);
  if (!raw || !/^https:\/\//i.test(raw)) return false;
  return !isUnsafeSourcePostUrl(raw);
}

export function isSafeOpenPostHref(href: unknown): boolean {
  const raw = normalizeString(href);
  if (!raw) return false;
  if (raw.startsWith("/")) return !isUnsafeSourcePostUrl(raw);
  if (!/^https:\/\//i.test(raw)) return false;
  return !isUnsafeSourcePostUrl(raw);
}

export function sourcePostContextViewIsSafe(view: SourcePostContextViewModel): boolean {
  const serialized = JSON.stringify(view);
  if (FORBIDDEN_DOM_PATTERNS.some((pattern) => pattern.test(serialized))) return false;
  for (const field of [view.postSnippet, view.leadComment, view.fallbackMessage, view.sourceBadgeLabel]) {
    if (field && isUnsafeSourcePostContent(field)) return false;
  }
  if (view.postThumbnailUrl && !isSafePostThumbnailUrl(view.postThumbnailUrl)) return false;
  if (view.openPostHref && !isSafeOpenPostHref(view.openPostHref)) return false;
  return true;
}

function readNestedApiDto(row: Record<string, unknown>): SourcePostContextApiDto | null {
  const nested =
    (isRecord(row.source_post_context) && row.source_post_context) ||
    (isRecord(row.sourcePostContext) && row.sourcePostContext) ||
    null;
  if (!nested) return null;

  const privateReplyStatus = normalizeString(nested.private_reply_status) || normalizeString(nested.privateReplyStatus);

  return {
    sourceBadgeLabel:
      normalizeString(nested.source_label) ||
      normalizeString(nested.sourceLabel) ||
      normalizeString(nested.sourceBadgeLabel) ||
      normalizeString(nested.source_badge_label) ||
      null,
    postThumbnailUrl:
      normalizeString(nested.post_thumbnail_url) ||
      normalizeString(nested.postThumbnailUrl) ||
      null,
    postSnippet:
      normalizeString(nested.post_snippet) || normalizeString(nested.postSnippet) || null,
    leadComment:
      normalizeString(nested.lead_comment_snippet) ||
      normalizeString(nested.leadCommentSnippet) ||
      normalizeString(nested.lead_comment) ||
      normalizeString(nested.leadComment) ||
      null,
    privateReplySent:
      privateReplyStatus === "sent" ||
      nested.privateReplySent === true ||
      nested.private_reply_sent === true ||
      nested.hasPrivateReply === true ||
      nested.has_private_reply === true,
    openPostAvailable:
      nested.openPostAvailable === true || nested.open_post_available === true,
    openPostHref:
      normalizeString(nested.open_post_href) || normalizeString(nested.openPostHref) || null,
    fallbackMessage:
      normalizeString(nested.fallback_message) || normalizeString(nested.fallbackMessage) || null,
    postDetailsAvailable:
      nested.postDetailsAvailable !== false && nested.post_details_available !== false
  };
}

function readPrivateReplySent(row: Record<string, unknown>, api?: SourcePostContextApiDto | null): boolean {
  if (api?.privateReplySent === true) return true;
  if (row.has_private_reply === true || row.hasPrivateReply === true) return true;
  const raw =
    normalizeString(row.private_reply_sent_at) || normalizeString(row.privateReplySentAt);
  if (!raw) return false;
  return !Number.isNaN(new Date(raw).getTime());
}

function resolveFallbackMessage(kind: SourcePostContextKind): string {
  return FALLBACK_MESSAGES[kind];
}

export function buildSourcePostContextViewModel(input: {
  kind: SourcePostContextKind;
  sourceBadgeLabel: string;
  api?: SourcePostContextApiDto | null;
  privateReplySent: boolean;
}): SourcePostContextViewModel {
  const api = input.api;
  const postDetailsAvailable = api?.postDetailsAvailable !== false && Boolean(
    api?.postSnippet || api?.leadComment || api?.postThumbnailUrl
  );

  if (!postDetailsAvailable) {
    return {
      kind: input.kind,
      sourceBadgeLabel: input.sourceBadgeLabel,
      postThumbnailUrl: null,
      showThumbnailPlaceholder: false,
      postSnippet: null,
      leadComment: null,
      privateReplySent: input.privateReplySent,
      openPostAvailable: false,
      openPostHref: null,
      postDetailsAvailable: false,
      fallbackMessage:
        sanitizeSourcePostText(api?.fallbackMessage) ?? resolveFallbackMessage(input.kind),
      testId: `source-post-context-${input.kind.toLowerCase().replace(/_/g, "-")}`
    };
  }

  const thumbnail = isSafePostThumbnailUrl(api?.postThumbnailUrl) ? api!.postThumbnailUrl!.trim() : null;
  const openHref =
    api?.openPostAvailable === true && isSafeOpenPostHref(api?.openPostHref)
      ? api!.openPostHref!.trim()
      : null;
  const showThumbnailPlaceholder =
    !thumbnail &&
    (input.kind === "FACEBOOK_COMMENT" ||
      input.kind === "FACEBOOK_PRIVATE_REPLY" ||
      input.kind === "INSTAGRAM_COMMENT");

  return {
    kind: input.kind,
    sourceBadgeLabel: sanitizeSourcePostText(api?.sourceBadgeLabel) ?? input.sourceBadgeLabel,
    postThumbnailUrl: thumbnail,
    showThumbnailPlaceholder,
    postSnippet: sanitizeSourcePostText(api?.postSnippet),
    leadComment: sanitizeSourcePostText(api?.leadComment),
    privateReplySent: input.privateReplySent,
    openPostAvailable: Boolean(openHref),
    openPostHref: openHref,
    postDetailsAvailable: true,
    fallbackMessage: null,
    testId: `source-post-context-${input.kind.toLowerCase().replace(/_/g, "-")}`
  };
}

/** Returns null for LINE, DM, and other non post-context sources. */
export function resolveSourcePostContext(row: Record<string, unknown>): SourcePostContextViewModel | null {
  const badge = resolveLeadSourceBadge(readLeadSourceFieldsFromRow(row));
  if (!isSourcePostKind(badge.key)) return null;

  const api = readNestedApiDto(row);
  const privateReplySent = readPrivateReplySent(row, api);

  const hasApiPayload =
    api &&
    (api.postSnippet ||
      api.leadComment ||
      (api.postThumbnailUrl && isSafePostThumbnailUrl(api.postThumbnailUrl)));

  if (!hasApiPayload) {
    return buildSourcePostContextViewModel({
      kind: badge.key,
      sourceBadgeLabel: badge.label,
      api: { ...api, postDetailsAvailable: false },
      privateReplySent
    });
  }

  return buildSourcePostContextViewModel({
    kind: badge.key,
    sourceBadgeLabel: api?.sourceBadgeLabel?.trim() || badge.label,
    api,
    privateReplySent
  });
}

export function sourcePostPrivateReplyStatusLabel(sent: boolean): string {
  return sent ? "Private reply sent" : "No private reply yet";
}

export function sourcePostPrivateReplyStatusClassName(sent: boolean): string {
  return sent
    ? "source-post-context-reply-badge source-post-context-reply-badge-sent"
    : "source-post-context-reply-badge source-post-context-reply-badge-pending";
}
