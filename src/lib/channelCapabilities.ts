import type { ProviderThreadType } from "../domain/entities.js";
import {
  INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED,
  INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE
} from "../domain/instagramDmMessages.js";

export type HubOutboundChannel = "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";

export type OutboundSendKind = "text" | "image" | "document_pdf";

export type FacebookTargetType = "MESSENGER" | "COMMENT";

export type ChannelCapabilityContext = {
  channel: HubOutboundChannel | string;
  providerThreadType?: ProviderThreadType | string | null;
  /** Facebook comment thread before the first private reply has been sent. */
  facebookPrivateReplyPending?: boolean;
  facebookTargetType?: FacebookTargetType | null;
};

export const FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY =
  "Facebook comment fallback only supports text-only private reply for first DM opening.";

export const FACEBOOK_COMMENT_IMAGE_UNSUPPORTED =
  "facebook image outbound is supported for MESSENGER only in this phase";
export const INSTAGRAM_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY =
  "Instagram comment private reply supports text-only on first reply in this phase.";

export const OUTBOUND_CHANNEL_UNSUPPORTED =
  "Outbound messaging is not supported for this channel yet.";

export const OUTBOUND_THREAD_TYPE_UNSUPPORTED =
  "Outbound messaging is not supported for this conversation type.";

const SUPPORTED_HUB_CHANNELS = new Set<HubOutboundChannel>(["LINE", "FACEBOOK", "INSTAGRAM"]);

const SUPPORTED_PROVIDER_THREAD_TYPES = new Set<ProviderThreadType>([
  "MESSENGER_DM",
  "FACEBOOK_COMMENT",
  "INSTAGRAM_DM",
  "INSTAGRAM_COMMENT"
]);

function isPrivateReplyPending(input: {
  channel: string;
  providerThreadType?: string | null;
  privateReplySentAt?: Date | string | null;
  facebookTargetType?: FacebookTargetType | null;
}): boolean {
  if (input.channel !== "FACEBOOK") return false;
  if (input.facebookTargetType === "COMMENT") return true;
  if (input.providerThreadType !== "FACEBOOK_COMMENT") return false;
  return !input.privateReplySentAt;
}

function isInstagramCommentPrivateReplyPending(input: {
  channel: string;
  providerThreadType?: string | null;
  privateReplySentAt?: Date | string | null;
}): boolean {
  if (input.channel !== "INSTAGRAM") return false;
  if (input.providerThreadType !== "INSTAGRAM_COMMENT") return false;
  return !input.privateReplySentAt;
}

export function buildChannelCapabilityContext(input: {
  channel: string;
  providerThreadType?: string | null;
  privateReplySentAt?: Date | string | null;
  facebookTargetType?: FacebookTargetType | null;
}): ChannelCapabilityContext {
  const facebookPrivateReplyPending =
    isPrivateReplyPending(input) || isInstagramCommentPrivateReplyPending(input);
  return {
    channel: input.channel,
    providerThreadType: input.providerThreadType ?? null,
    facebookPrivateReplyPending,
    facebookTargetType: input.facebookTargetType ?? null
  };
}

export function sendKindFromApiType(type: "text" | "image" | "document_pdf"): OutboundSendKind {
  return type;
}

export function sendKindFromMessageType(messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF" | null): OutboundSendKind {
  if (messageType === "IMAGE") return "image";
  if (messageType === "DOCUMENT_PDF") return "document_pdf";
  return "text";
}

function isKnownHubChannel(channel: string): channel is HubOutboundChannel {
  return SUPPORTED_HUB_CHANNELS.has(channel as HubOutboundChannel);
}

function resolveFacebookCommentPending(ctx: ChannelCapabilityContext): boolean {
  if (ctx.channel !== "FACEBOOK") return false;
  if (ctx.facebookPrivateReplyPending) return true;
  return ctx.facebookTargetType === "COMMENT";
}

function resolveInstagramCommentPending(ctx: ChannelCapabilityContext): boolean {
  return ctx.channel === "INSTAGRAM" && ctx.providerThreadType === "INSTAGRAM_COMMENT" && Boolean(ctx.facebookPrivateReplyPending);
}

function resolveEffectiveProviderThreadType(ctx: ChannelCapabilityContext): ProviderThreadType | null {
  if (ctx.providerThreadType && SUPPORTED_PROVIDER_THREAD_TYPES.has(ctx.providerThreadType as ProviderThreadType)) {
    return ctx.providerThreadType as ProviderThreadType;
  }
  if (ctx.channel === "FACEBOOK" && ctx.facebookTargetType === "MESSENGER") return "MESSENGER_DM";
  if (ctx.channel === "FACEBOOK" && ctx.facebookTargetType === "COMMENT") return "FACEBOOK_COMMENT";
  if (ctx.channel === "INSTAGRAM") return "INSTAGRAM_DM";
  return null;
}

export function isOutboundSendKindSupported(ctx: ChannelCapabilityContext, kind: OutboundSendKind): boolean {
  return getOutboundSendUnsupportedReason(ctx, kind) === null;
}

export type OutboundCapabilityOptions = {
  /** When routing to Facebook first private reply (worker use case). */
  facebookPrivateReplyRoute?: boolean;
};

export function getOutboundSendUnsupportedReason(
  ctx: ChannelCapabilityContext,
  kind: OutboundSendKind,
  options?: OutboundCapabilityOptions
): string | null {
  if (!isKnownHubChannel(ctx.channel)) {
    return OUTBOUND_CHANNEL_UNSUPPORTED;
  }

  const threadType = resolveEffectiveProviderThreadType(ctx);

  if (ctx.channel === "LINE") {
    return null;
  }

  if (ctx.channel === "INSTAGRAM") {
    if (threadType && threadType !== "INSTAGRAM_DM" && threadType !== "INSTAGRAM_COMMENT") {
      return OUTBOUND_THREAD_TYPE_UNSUPPORTED;
    }
    if (threadType === "INSTAGRAM_COMMENT" && resolveInstagramCommentPending(ctx)) {
      return kind === "text" ? null : INSTAGRAM_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY;
    }
    if (kind === "document_pdf") return INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED;
    if (kind === "text" || kind === "image") return null;
    return INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE;
  }

  if (ctx.channel === "FACEBOOK") {
    if (threadType && !SUPPORTED_PROVIDER_THREAD_TYPES.has(threadType)) {
      return OUTBOUND_THREAD_TYPE_UNSUPPORTED;
    }

    const commentFirstPrivateReply = resolveFacebookCommentPending(ctx);
    if (commentFirstPrivateReply) {
      if (kind === "text") return null;
      if (options?.facebookPrivateReplyRoute) {
        return FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY;
      }
      if (kind === "image") return FACEBOOK_COMMENT_IMAGE_UNSUPPORTED;
      return FACEBOOK_COMMENT_FIRST_PRIVATE_REPLY_TEXT_ONLY;
    }

    return null;
  }

  return OUTBOUND_CHANNEL_UNSUPPORTED;
}

export function assertOutboundSendAllowed(
  ctx: ChannelCapabilityContext,
  kind: OutboundSendKind
): { allowed: true } | { allowed: false; reason: string } {
  const reason = getOutboundSendUnsupportedReason(ctx, kind);
  if (reason) return { allowed: false, reason };
  return { allowed: true };
}

/** Capability flags for UI or diagnostics (does not include size/MIME validation). */
export function getOutboundCapabilityFlags(ctx: ChannelCapabilityContext): {
  text: boolean;
  image: boolean;
  documentPdf: boolean;
  firstPrivateReply: boolean;
  publicCommentReply: boolean;
} {
  return {
    text: isOutboundSendKindSupported(ctx, "text"),
    image: isOutboundSendKindSupported(ctx, "image"),
    documentPdf: isOutboundSendKindSupported(ctx, "document_pdf"),
    firstPrivateReply:
      ctx.channel === "FACEBOOK" &&
      (ctx.providerThreadType === "FACEBOOK_COMMENT" || ctx.facebookTargetType === "COMMENT") &&
      Boolean(ctx.facebookPrivateReplyPending ?? ctx.facebookTargetType === "COMMENT"),
    publicCommentReply: ctx.channel === "FACEBOOK" && ctx.providerThreadType === "FACEBOOK_COMMENT"
  };
}
