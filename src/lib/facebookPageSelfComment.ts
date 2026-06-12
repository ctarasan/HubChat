import {
  classifyFacebookFeedInbound,
  type FacebookFeedChangeValue,
  shouldIngestFacebookFeedChange,
  shouldSkipFacebookFeedVerb
} from "./facebookInboundCommentKind.js";

export function normalizeFacebookProviderId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Trusted receiving Facebook Page ID from webhook entry and optional configured page metadata. */
export function resolveFacebookReceivingPageId(
  entryId: unknown,
  configuredPageId?: unknown
): string | null {
  return normalizeFacebookProviderId(entryId) ?? normalizeFacebookProviderId(configuredPageId);
}

function extractFeedChangeCommenterId(value: FacebookFeedChangeValue): string | null {
  const fromId = typeof value.from?.id === "string" ? value.from.id.trim() : "";
  if (fromId) return fromId;
  const senderId = typeof (value as { sender_id?: unknown }).sender_id === "string"
    ? (value as { sender_id: string }).sender_id.trim()
    : "";
  if (senderId) return senderId;
  const nestedSender = (value as { sender?: { id?: unknown } }).sender;
  if (typeof nestedSender?.id === "string" && nestedSender.id.trim()) return nestedSender.id.trim();
  return null;
}

function hasPayloadCommentText(value: FacebookFeedChangeValue): boolean {
  const candidates = [
    value.message,
    value.comment_text,
    value.text,
    value.comment?.message,
    value.comment?.text
  ];
  return candidates.some((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
}

/**
 * True when comment sender provider ID equals the receiving Facebook Page ID.
 * Missing/ambiguous IDs return false (fail-open — do not suppress).
 */
export function isFacebookPageSelfComment(input: {
  commenterId: string | null | undefined;
  receivingPageId: string | null | undefined;
}): boolean {
  const commenter = normalizeFacebookProviderId(input.commenterId);
  const page = normalizeFacebookProviderId(input.receivingPageId);
  if (!commenter || !page) return false;
  return commenter === page;
}

/** True when the webhook payload contains only ignorable Facebook page self-comment feed events. */
export function isFacebookPageSelfCommentOnlyWebhookPayload(
  raw: unknown,
  configuredPageId?: string | null
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const payload = raw as {
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: FacebookFeedChangeValue }> }>;
  };

  let sawSelfComment = false;
  let sawIngestible = false;

  for (const entry of payload.entry ?? []) {
    const receivingPageId = resolveFacebookReceivingPageId(entry.id, configuredPageId);
    for (const change of entry.changes ?? []) {
      const field = change.field ?? "";
      if (field !== "feed" && field !== "comments") continue;
      const value = change.value;
      if (!value) continue;

      const commenterId = extractFeedChangeCommenterId(value);
      if (!commenterId) continue;
      if (shouldSkipFacebookFeedVerb(value.verb)) continue;

      const hasCommentText = hasPayloadCommentText(value);
      const ingestInput = { field, value, hasCommentText, hasAttachmentImage: false };
      const kind = classifyFacebookFeedInbound(ingestInput);
      if (kind === "reaction" || kind === "non_comment") continue;
      if (!shouldIngestFacebookFeedChange(ingestInput)) continue;

      if (isFacebookPageSelfComment({ commenterId, receivingPageId })) {
        sawSelfComment = true;
        continue;
      }
      sawIngestible = true;
    }
  }

  return sawSelfComment && !sawIngestible;
}
