export type FacebookInboundKind =
  | "comment_text"
  | "comment_without_text"
  | "comment_attachment"
  | "reaction"
  | "unknown_comment"
  | "non_comment";

const SKIPPED_FEED_VERBS = new Set([
  "remove",
  "removed",
  "delete",
  "deleted",
  "hide",
  "hidden",
  "unhide"
]);

/** Feed `item` values that are not customer comment/reaction inbox events. */
const NON_COMMENT_FEED_ITEMS = new Set([
  "status",
  "post",
  "share",
  "link",
  "photo",
  "video",
  "album",
  "event",
  "offer"
]);

export type FacebookFeedChangeValue = {
  item?: unknown;
  verb?: unknown;
  comment_id?: unknown;
  message?: unknown;
  comment_text?: unknown;
  text?: unknown;
  comment?: { message?: unknown; text?: unknown };
};

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function shouldSkipFacebookFeedVerb(verb: unknown): boolean {
  const normalized = normalizeToken(verb);
  return normalized != null && SKIPPED_FEED_VERBS.has(normalized);
}

export function classifyFacebookFeedInbound(input: {
  field: string;
  value: FacebookFeedChangeValue;
  hasCommentText: boolean;
  hasAttachmentImage: boolean;
}): FacebookInboundKind {
  const field = input.field.trim().toLowerCase();
  const item = normalizeToken(input.value.item);
  const hasCommentId =
    typeof input.value.comment_id === "string" ? input.value.comment_id.trim().length > 0 : false;

  if (item === "reaction") return "reaction";

  if (item != null && NON_COMMENT_FEED_ITEMS.has(item)) return "non_comment";

  const commentField = field === "comments";
  const commentItem = item === "comment";
  const commentLike = commentField || commentItem || (hasCommentId && item !== "reaction");

  if (!commentLike) return "non_comment";

  if (input.hasAttachmentImage && !input.hasCommentText) return "comment_attachment";
  if (input.hasCommentText) return "comment_text";
  return hasCommentId || commentItem || commentField ? "comment_without_text" : "unknown_comment";
}

export function shouldIngestFacebookFeedChange(input: {
  field: string;
  value: FacebookFeedChangeValue;
  hasCommentText: boolean;
  hasAttachmentImage: boolean;
}): boolean {
  if (shouldSkipFacebookFeedVerb(input.value.verb)) return false;
  const kind = classifyFacebookFeedInbound(input);
  return kind !== "non_comment";
}

export function shouldExtractFacebookCommentTextFromPayload(kind: FacebookInboundKind): boolean {
  return (
    kind === "comment_text" ||
    kind === "comment_without_text" ||
    kind === "comment_attachment" ||
    kind === "unknown_comment"
  );
}

export function resolveFacebookCommentInboundPreviewText(input: {
  kind: FacebookInboundKind;
  payloadText: string | null;
  graphDetailText: string | null;
  graphText: string | null;
  hasAttachmentImage: boolean;
}): { text: string; usedPlaceholder: boolean } {
  if (input.kind === "reaction") {
    return { text: "[reaction]", usedPlaceholder: true };
  }

  const resolved =
    input.payloadText ?? input.graphDetailText ?? input.graphText ?? null;
  if (resolved) {
    return { text: resolved, usedPlaceholder: false };
  }

  if (input.hasAttachmentImage) {
    return { text: "", usedPlaceholder: false };
  }

  if (input.kind === "comment_attachment") {
    return { text: "[comment]", usedPlaceholder: true };
  }

  return { text: "[comment]", usedPlaceholder: true };
}
