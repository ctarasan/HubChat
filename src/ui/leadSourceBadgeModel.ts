/**
 * Lead source badge model (SRC-1B).
 * Maps PR #196 API source fields to operator-facing badge labels.
 *
 * Conversations (snake_case): source_type, source_label, has_comment_context, has_private_reply
 * Leads (camelCase): sourceType, sourceLabel, hasCommentContext, hasPrivateReply
 *
 * Legacy fallback when source_type/sourceType absent: provider_thread_type + private_reply_sent_at.
 */

import type { LeadSourceType } from "../domain/leadSourceClassification.js";

export const LEAD_SOURCE_BADGE_KEYS = [
  "FACEBOOK_DM",
  "FACEBOOK_COMMENT",
  "FACEBOOK_PRIVATE_REPLY",
  "INSTAGRAM_DM",
  "INSTAGRAM_COMMENT",
  "INSTAGRAM_PRIVATE_REPLY",
  "LINE_CHAT",
  "UNKNOWN"
] as const;

export type LeadSourceBadgeKey = (typeof LEAD_SOURCE_BADGE_KEYS)[number];

export type LeadSourceBadgeInput = {
  channel_type?: string | null;
  channelType?: string | null;
  /** Conversation list API (PR #196). */
  source_type?: LeadSourceType | string | null;
  sourceType?: LeadSourceType | string | null;
  source_label?: string | null;
  sourceLabel?: string | null;
  has_comment_context?: boolean | null;
  hasCommentContext?: boolean | null;
  has_private_reply?: boolean | null;
  hasPrivateReply?: boolean | null;
  /** Legacy fallback only (pre-#196 rows). */
  provider_thread_type?: string | null;
  providerThreadType?: string | null;
  private_reply_sent_at?: string | null;
  privateReplySentAt?: string | null;
};

export type LeadSourceBadgeDescriptor = {
  key: LeadSourceBadgeKey;
  label: string;
  className: string;
  testId: string;
};

const LABELS: Record<LeadSourceBadgeKey, string> = {
  FACEBOOK_DM: "Facebook · DM",
  FACEBOOK_COMMENT: "Facebook · Comment",
  FACEBOOK_PRIVATE_REPLY: "Facebook · Private Reply",
  INSTAGRAM_DM: "Instagram · DM",
  INSTAGRAM_COMMENT: "Instagram · Comment",
  INSTAGRAM_PRIVATE_REPLY: "Instagram · Private Reply",
  LINE_CHAT: "LINE · Chat",
  UNKNOWN: "Unknown"
};

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function readChannel(input: LeadSourceBadgeInput): string {
  return (normalizeString(input.channel_type) || normalizeString(input.channelType)).toUpperCase();
}

function readSourceType(input: LeadSourceBadgeInput): LeadSourceType | null {
  const raw = normalizeString(input.source_type) || normalizeString(input.sourceType);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (
    upper === "DM" ||
    upper === "COMMENT" ||
    upper === "PRIVATE_REPLY" ||
    upper === "CHAT" ||
    upper === "UNKNOWN"
  ) {
    return upper as LeadSourceType;
  }
  return null;
}

function readThreadType(input: LeadSourceBadgeInput): string {
  return (
    normalizeString(input.provider_thread_type) || normalizeString(input.providerThreadType)
  ).toUpperCase();
}

function readPrivateReplySent(input: LeadSourceBadgeInput): boolean {
  if (input.has_private_reply === true || input.hasPrivateReply === true) return true;
  const raw =
    normalizeString(input.private_reply_sent_at) || normalizeString(input.privateReplySentAt);
  if (!raw) return false;
  const dt = new Date(raw);
  return !Number.isNaN(dt.getTime());
}

function mapChannelSourceType(channel: string, sourceType: LeadSourceType): LeadSourceBadgeKey {
  if (channel === "LINE" || sourceType === "CHAT") return "LINE_CHAT";

  if (channel === "FACEBOOK") {
    if (sourceType === "DM") return "FACEBOOK_DM";
    if (sourceType === "COMMENT") return "FACEBOOK_COMMENT";
    if (sourceType === "PRIVATE_REPLY") return "FACEBOOK_PRIVATE_REPLY";
    return "UNKNOWN";
  }

  if (channel === "INSTAGRAM") {
    if (sourceType === "DM") return "INSTAGRAM_DM";
    if (sourceType === "COMMENT") return "INSTAGRAM_COMMENT";
    if (sourceType === "PRIVATE_REPLY") return "INSTAGRAM_PRIVATE_REPLY";
    return "UNKNOWN";
  }

  return "UNKNOWN";
}

function resolveFromLegacyThreadFields(input: LeadSourceBadgeInput): LeadSourceBadgeKey {
  const channel = readChannel(input);
  const threadType = readThreadType(input);
  const privateReplySent = readPrivateReplySent(input);

  if (channel === "LINE") return "LINE_CHAT";

  if (channel === "FACEBOOK") {
    if (threadType === "FACEBOOK_COMMENT") {
      return privateReplySent ? "FACEBOOK_PRIVATE_REPLY" : "FACEBOOK_COMMENT";
    }
    return "FACEBOOK_DM";
  }

  if (channel === "INSTAGRAM") {
    if (threadType === "INSTAGRAM_COMMENT") {
      return privateReplySent ? "INSTAGRAM_PRIVATE_REPLY" : "INSTAGRAM_COMMENT";
    }
    return "INSTAGRAM_DM";
  }

  return "UNKNOWN";
}

export function resolveLeadSourceBadgeKey(input: LeadSourceBadgeInput): LeadSourceBadgeKey {
  const channel = readChannel(input);
  const sourceType = readSourceType(input);
  if (sourceType) {
    return mapChannelSourceType(channel, sourceType);
  }
  return resolveFromLegacyThreadFields(input);
}

export function leadSourceBadgeClassName(key: LeadSourceBadgeKey): string {
  return `lead-source-badge lead-source-badge-${key.toLowerCase().replace(/_/g, "-")}`;
}

export function resolveLeadSourceBadge(input: LeadSourceBadgeInput): LeadSourceBadgeDescriptor {
  const key = resolveLeadSourceBadgeKey(input);
  return {
    key,
    label: LABELS[key],
    className: leadSourceBadgeClassName(key),
    testId: `lead-source-badge-${key.toLowerCase().replace(/_/g, "-")}`
  };
}

export function readLeadSourceFieldsFromRow(row: Record<string, unknown>): LeadSourceBadgeInput {
  return {
    channel_type: normalizeString(row.channel_type) || normalizeString(row.channel) || normalizeString(row.channelType),
    source_type: normalizeString(row.source_type) || null,
    sourceType: normalizeString(row.sourceType) || null,
    source_label: normalizeString(row.source_label) || null,
    sourceLabel: normalizeString(row.sourceLabel) || null,
    has_comment_context:
      typeof row.has_comment_context === "boolean" ? row.has_comment_context : null,
    hasCommentContext: typeof row.hasCommentContext === "boolean" ? row.hasCommentContext : null,
    has_private_reply: typeof row.has_private_reply === "boolean" ? row.has_private_reply : null,
    hasPrivateReply: typeof row.hasPrivateReply === "boolean" ? row.hasPrivateReply : null,
    provider_thread_type: normalizeString(row.provider_thread_type) || null,
    providerThreadType: normalizeString(row.providerThreadType) || null,
    private_reply_sent_at: normalizeString(row.private_reply_sent_at) || null,
    privateReplySentAt: normalizeString(row.privateReplySentAt) || null
  };
}
