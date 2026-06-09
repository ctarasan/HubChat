export type LeadSourceType = "DM" | "COMMENT" | "PRIVATE_REPLY" | "CHAT" | "UNKNOWN";

export type LeadSourceClassification = {
  sourceType: LeadSourceType;
  sourceLabel: string;
  hasCommentContext: boolean;
  hasPrivateReply: boolean;
};

const SOURCE_LABELS: Record<LeadSourceType, string> = {
  DM: "Direct Message",
  COMMENT: "Comment",
  PRIVATE_REPLY: "Private Reply",
  CHAT: "Chat",
  UNKNOWN: "Unknown"
};

export type LeadSourceClassificationInput = {
  channelType: string;
  providerThreadType?: string | null;
  privateReplySentAt?: Date | string | null;
  channelThreadId?: string | null;
  providerCommentId?: string | null;
};

function hasTruthyTimestamp(value: Date | string | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function isCommentThreadType(providerThreadType: string | null | undefined): boolean {
  return providerThreadType === "FACEBOOK_COMMENT" || providerThreadType === "INSTAGRAM_COMMENT";
}

function isDmThreadType(providerThreadType: string | null | undefined): boolean {
  return providerThreadType === "MESSENGER_DM" || providerThreadType === "INSTAGRAM_DM";
}

function threadIdImpliesComment(channelType: string, channelThreadId: string | null | undefined): boolean {
  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("comment:") || trimmed.startsWith("ig:comment:")) return true;
  if (channelType === "FACEBOOK" && trimmed.includes("_") && !trimmed.startsWith("user:")) return true;
  return false;
}

function threadIdImpliesDm(channelType: string, channelThreadId: string | null | undefined): boolean {
  const trimmed = (channelThreadId ?? "").trim();
  if (!trimmed) return false;
  if (channelType === "FACEBOOK" && (trimmed.startsWith("user:") || /^\d+$/.test(trimmed))) return true;
  if (channelType === "INSTAGRAM" && trimmed.startsWith("ig:user:")) return true;
  return false;
}

export function classifyLeadSource(input: LeadSourceClassificationInput): LeadSourceClassification {
  const channel = (input.channelType ?? "").trim().toUpperCase();
  const providerThreadType = (input.providerThreadType ?? "").trim() || null;
  const hasPrivateReply = hasTruthyTimestamp(input.privateReplySentAt);
  const hasCommentId = Boolean((input.providerCommentId ?? "").trim());
  const commentThread = isCommentThreadType(providerThreadType);
  const commentFromThreadId = threadIdImpliesComment(channel, input.channelThreadId);
  const hasCommentContext = commentThread || hasPrivateReply || hasCommentId || commentFromThreadId;

  if (channel === "LINE") {
    return {
      sourceType: "CHAT",
      sourceLabel: SOURCE_LABELS.CHAT,
      hasCommentContext: false,
      hasPrivateReply: false
    };
  }

  if (channel === "FACEBOOK" || channel === "INSTAGRAM") {
    if (hasPrivateReply) {
      return {
        sourceType: "PRIVATE_REPLY",
        sourceLabel: SOURCE_LABELS.PRIVATE_REPLY,
        hasCommentContext: true,
        hasPrivateReply: true
      };
    }
    if (commentThread || (commentFromThreadId && !isDmThreadType(providerThreadType))) {
      return {
        sourceType: "COMMENT",
        sourceLabel: SOURCE_LABELS.COMMENT,
        hasCommentContext: true,
        hasPrivateReply: false
      };
    }
    if (isDmThreadType(providerThreadType) || threadIdImpliesDm(channel, input.channelThreadId)) {
      return {
        sourceType: "DM",
        sourceLabel: SOURCE_LABELS.DM,
        hasCommentContext: false,
        hasPrivateReply: false
      };
    }
    return {
      sourceType: "UNKNOWN",
      sourceLabel: SOURCE_LABELS.UNKNOWN,
      hasCommentContext,
      hasPrivateReply: false
    };
  }

  return {
    sourceType: "UNKNOWN",
    sourceLabel: SOURCE_LABELS.UNKNOWN,
    hasCommentContext: false,
    hasPrivateReply: false
  };
}
