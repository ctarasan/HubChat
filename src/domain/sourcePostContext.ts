import { classifyLeadSource, type LeadSourceType } from "./leadSourceClassification.js";
import { sanitizeSourcePostSnippet } from "../lib/sourcePostSnippetSanitize.js";

export { SOURCE_POST_SNIPPET_MAX_LENGTH, sanitizeSourcePostSnippet } from "../lib/sourcePostSnippetSanitize.js";

export type SourcePostChannelType = "FACEBOOK" | "INSTAGRAM";
export type SourcePostSourceType = "COMMENT" | "PRIVATE_REPLY";
export type PrivateReplyStatus = "sent" | "not_sent" | "unknown";

/** Snake_case API shape for conversation list / Details panel. */
export type SourcePostContextDto = {
  channel_type: SourcePostChannelType;
  source_type: SourcePostSourceType;
  source_label: string;
  post_snippet: string | null;
  post_timestamp: string | null;
  post_thumbnail_url: string | null;
  lead_comment_snippet: string | null;
  lead_comment_timestamp: string | null;
  private_reply_status: PrivateReplyStatus;
  open_post_available: boolean;
  open_post_href: string | null;
  fallback_message: string | null;
};

const SOURCE_LABELS: Record<SourcePostChannelType, Record<SourcePostSourceType, string>> = {
  FACEBOOK: {
    COMMENT: "Facebook · Comment",
    PRIVATE_REPLY: "Facebook · Private Reply"
  },
  INSTAGRAM: {
    COMMENT: "Instagram · Comment",
    PRIVATE_REPLY: "Instagram · Private Reply"
  }
};

const FALLBACK_MESSAGES: Record<SourcePostChannelType, Record<SourcePostSourceType, string>> = {
  FACEBOOK: {
    COMMENT: "This lead came from a Facebook comment. Post details are not available yet.",
    PRIVATE_REPLY: "This lead came from a Facebook private reply. Post details are not available yet."
  },
  INSTAGRAM: {
    COMMENT: "This lead came from an Instagram comment. Post details are not available yet.",
    PRIVATE_REPLY: "This lead came from an Instagram private reply. Post details are not available yet."
  }
};

const BLOCKED_THUMBNAIL_SUBSTRINGS = [
  "profile_pic",
  "profile.php",
  "/picture?",
  "/profile/",
  "profile_pic_url",
  "scontent.cdninstagram.com/v/t51.2885-19/"
] as const;

export type SourcePostContextBuildInput = {
  conversationId?: string | null;
  channelType: string;
  providerThreadType?: string | null;
  privateReplySentAt?: string | null;
  channelThreadId?: string | null;
  providerCommentId?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  lastCustomerMessageAt?: string | null;
  /** Optional first inbound comment body (detail enrichment). */
  leadCommentContent?: string | null;
  leadCommentOccurredAt?: string | null;
  /** Optional post caption from sanitized storage (never raw webhook). */
  postContent?: string | null;
  postOccurredAt?: string | null;
  /** Sanitized inbound message metadata for post media only. */
  messageMetadata?: Record<string, unknown> | null;
};

function normalizeIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isSafePostThumbnailUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return false;
  const lower = trimmed.toLowerCase();
  return !BLOCKED_THUMBNAIL_SUBSTRINGS.some((blocked) => lower.includes(blocked));
}

function pickMetadataUrl(metadata: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && isSafePostThumbnailUrl(value)) {
      return value.trim();
    }
  }
  return null;
}

function toSourcePostSourceType(sourceType: LeadSourceType): SourcePostSourceType | null {
  if (sourceType === "COMMENT") return "COMMENT";
  if (sourceType === "PRIVATE_REPLY") return "PRIVATE_REPLY";
  return null;
}

function toSourcePostChannelType(channelType: string): SourcePostChannelType | null {
  const channel = channelType.trim().toUpperCase();
  if (channel === "FACEBOOK") return "FACEBOOK";
  if (channel === "INSTAGRAM") return "INSTAGRAM";
  return null;
}

function hasPostDetail(postSnippet: string | null, postThumbnailUrl: string | null): boolean {
  return Boolean(postSnippet || postThumbnailUrl);
}

/**
 * Derives safe source post context for Facebook/Instagram comment and private-reply leads.
 * Returns null for LINE, DM, and other non-comment sources.
 */
export function buildSourcePostContext(input: SourcePostContextBuildInput): SourcePostContextDto | null {
  const channelType = toSourcePostChannelType(input.channelType);
  if (!channelType) return null;

  const classification = classifyLeadSource({
    channelType: input.channelType,
    providerThreadType: input.providerThreadType,
    privateReplySentAt: input.privateReplySentAt,
    channelThreadId: input.channelThreadId,
    providerCommentId: input.providerCommentId
  });

  const sourceType = toSourcePostSourceType(classification.sourceType);
  if (!sourceType) return null;

  const postSnippet =
    sanitizeSourcePostSnippet(input.postContent) ??
    sanitizeSourcePostSnippet(
      typeof input.messageMetadata?.source_post_snippet === "string"
        ? input.messageMetadata.source_post_snippet
        : null
    );
  const postThumbnailUrl = pickMetadataUrl(
    input.messageMetadata,
    "thumbnailUrl",
    "thumbnail_url",
    "fullImageUrl",
    "full_image_url"
  );

  const leadCommentSnippet = sanitizeSourcePostSnippet(
    input.leadCommentContent ?? input.lastMessagePreview
  );

  const leadCommentTimestamp =
    normalizeIso(input.leadCommentOccurredAt) ??
    normalizeIso(input.lastCustomerMessageAt) ??
    normalizeIso(input.lastMessageAt);

  const postTimestamp =
    normalizeIso(input.postOccurredAt) ??
    normalizeIso(
      typeof input.messageMetadata?.source_post_captured_at === "string"
        ? input.messageMetadata.source_post_captured_at
        : null
    );
  const privateReplyStatus: PrivateReplyStatus = classification.hasPrivateReply ? "sent" : "not_sent";

  const fallbackMessage = hasPostDetail(postSnippet, postThumbnailUrl)
    ? null
    : FALLBACK_MESSAGES[channelType][sourceType];

  return {
    channel_type: channelType,
    source_type: sourceType,
    source_label: SOURCE_LABELS[channelType][sourceType],
    post_snippet: postSnippet,
    post_timestamp: postTimestamp,
    post_thumbnail_url: postThumbnailUrl,
    lead_comment_snippet: leadCommentSnippet,
    lead_comment_timestamp: leadCommentTimestamp,
    private_reply_status: privateReplyStatus,
    open_post_available: false,
    open_post_href: null,
    fallback_message: fallbackMessage
  };
}
