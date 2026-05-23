import type { ChannelAdapter } from "../../../domain/ports.js";
import { parseMetaTimestamp } from "../../../domain/dateUtils.js";
import {
  INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT,
  INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL,
  INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME,
  INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED,
  INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE,
  INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE,
  instagramDmOutboundCaptionToSend
} from "../../../domain/instagramDmMessages.js";
import pino from "pino";
import { validateInstagramOutboundImageMedia } from "../../../lib/mediaPolicy.js";
import { InstagramGraphApiError } from "./instagramGraphApiError.js";

export {
  INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT,
  INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL,
  INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME,
  INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED,
  INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE,
  INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE,
  INSTAGRAM_DM_IMAGE_PLACEHOLDER_CONTENT
} from "../../../domain/instagramDmMessages.js";

interface InstagramConfig {
  /** Facebook Page access token used with `/{page-id}/messages` (not Instagram Login IGA tokens). */
  accessToken: string;
  graphVersion?: string;
  /** Optional Instagram Business Account id — used elsewhere; outbound uses Page token + me/page path. */
  businessAccountId?: string;
  /** Facebook Page id for Graph endpoint `/{page-id}/messages`. */
  pageId?: string;
}

export { InstagramGraphApiError } from "./instagramGraphApiError.js";

const instagramAdapterLogger = pino({ name: "instagram-adapter" });

/**
 * Meta returns "Cannot parse access token" if the string has stray whitespace, wrapping quotes,
 * or line breaks pasted inside the token. Instagram Send API requires a Facebook Page access token.
 */
function normalizeAccessToken(raw: string): string {
  let t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  // Copy-paste from chat/email/PDF sometimes inserts newlines in the middle of the token
  t = t.replace(/\s+/g, "");
  return t;
}

function assertLikelyGraphPageAccessToken(token: string): void {
  if (token.startsWith("IGA") || /^IG_/i.test(token)) {
    throw new Error(
      "Instagram outbound: got an Instagram-scoped Login token (e.g. IGA…). Use the Facebook Page access token for the Page connected to your Instagram Professional account (FACEBOOK_PAGE_ACCESS_TOKEN recommended)."
    );
  }
  if (token.length < 80) {
    throw new Error(
      "Instagram outbound: access token is too short after trimming. Use the Facebook Page access token for the Page linked to this Instagram account (Graph API / Page settings), not the App Secret."
    );
  }
  if (!token.startsWith("EA")) {
    throw new Error(
      'Instagram outbound: token does not look like a Meta Page/User Graph access token (expected to start with "EA"). For Instagram DM send API use a Page access token with messaging permissions.'
    );
  }
  if (/["{}]|^https?:\/\//i.test(token)) {
    throw new Error(
      "Instagram outbound: token looks like JSON or a URL was pasted. Paste only the raw Page access token string into Railway."
    );
  }
}

const DEFAULT_META_GRAPH_VERSION = "v25.0";

function normalizeGraphVersion(value: string | undefined): string {
  const raw = (value ?? DEFAULT_META_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_META_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function normalizeInstagramThreadId(igsid: string): string {
  return `ig:user:${igsid}`;
}

/** HubChat thread id → Instagram-scoped customer id for `recipient.id`. */
export function extractInstagramRecipientIgsidFromThreadId(channelThreadId: string): string | null {
  const trimmed = channelThreadId.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("ig:user:")) return null;
  const value = trimmed.slice("ig:user:".length).trim();
  if (!value || !/^\d+$/.test(value)) return null;
  return value;
}

/** First image attachment with an HTTPS URL (Meta webhook: attachments[].type === "image", payload.url). */
export function extractFirstHttpsImageUrlFromAttachments(attachments: unknown[]): string | null {
  for (const raw of attachments) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as { type?: string; payload?: { url?: string } };
    const type = typeof a.type === "string" ? a.type.trim().toLowerCase() : "";
    if (type !== "image") continue;
    const url = typeof a.payload?.url === "string" ? a.payload.url.trim() : "";
    if (url && /^https:\/\//i.test(url)) return url;
  }
  return null;
}

function parseMetaSendErrorBody(bodyText: string): InstagramGraphApiError["meta"] {
  try {
    const j = JSON.parse(bodyText) as { error?: Record<string, unknown> };
    const e = j.error;
    if (!e || typeof e !== "object") return {};
    return {
      message: typeof e.message === "string" ? e.message : undefined,
      type: typeof e.type === "string" ? e.type : undefined,
      code: typeof e.code === "number" ? e.code : undefined,
      error_subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
      fbtrace_id: typeof e.fbtrace_id === "string" ? e.fbtrace_id : undefined
    };
  } catch {
    return {};
  }
}

export class InstagramAdapter implements ChannelAdapter {
  readonly channel = "INSTAGRAM" as const;

  private readonly config: InstagramConfig;

  constructor(config: InstagramConfig) {
    this.config = {
      ...config,
      accessToken: normalizeAccessToken(config.accessToken),
      ...(config.pageId?.trim() ? { pageId: config.pageId.trim() } : {})
    };
  }

  private *iterateMessagingEvents(payload: {
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: unknown;
        message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
      }>;
      changes?: Array<{
        value?: {
          messaging?: Array<{
            sender?: { id?: string };
            recipient?: { id?: string };
            timestamp?: unknown;
            message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
          }>;
          messages?: Array<{
            id?: string;
            from?: string;
            text?: string;
            timestamp?: unknown;
          }>;
        };
      }>;
    }>;
  }): Generator<{
    senderId: string;
    recipientId: string | null;
    ownerAccountId: string | null;
    timestamp: unknown;
    messageMid: string | null;
    text: string;
    attachments: unknown[];
    isEcho: boolean;
  }> {
    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        const senderId = typeof msg.sender?.id === "string" ? msg.sender.id.trim() : "";
        if (!senderId) continue;
        const text = typeof msg.message?.text === "string" ? msg.message.text.trim() : "";
        const attachments = Array.isArray(msg.message?.attachments) ? msg.message.attachments : [];
        const messageMid = typeof msg.message?.mid === "string" && msg.message.mid.trim() ? msg.message.mid.trim() : null;
        const recipientId = typeof msg.recipient?.id === "string" && msg.recipient.id.trim() ? msg.recipient.id.trim() : null;
        yield {
          senderId,
          recipientId,
          ownerAccountId: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null,
          timestamp: msg.timestamp,
          messageMid,
          text,
          attachments,
          isEcho: Boolean(msg.message?.is_echo)
        };
      }
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messaging ?? []) {
          const senderId = typeof msg.sender?.id === "string" ? msg.sender.id.trim() : "";
          if (!senderId) continue;
          const text = typeof msg.message?.text === "string" ? msg.message.text.trim() : "";
          const attachments = Array.isArray(msg.message?.attachments) ? msg.message.attachments : [];
          const messageMid = typeof msg.message?.mid === "string" && msg.message.mid.trim() ? msg.message.mid.trim() : null;
          const recipientId = typeof msg.recipient?.id === "string" && msg.recipient.id.trim() ? msg.recipient.id.trim() : null;
          yield {
            senderId,
            recipientId,
            ownerAccountId: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null,
            timestamp: msg.timestamp,
            messageMid,
            text,
            attachments,
            isEcho: Boolean(msg.message?.is_echo)
          };
        }
        for (const msg of change.value?.messages ?? []) {
          const senderId = typeof msg.from === "string" ? msg.from.trim() : "";
          if (!senderId) continue;
          const text = typeof msg.text === "string" ? msg.text.trim() : "";
          const messageMid = typeof msg.id === "string" && msg.id.trim() ? msg.id.trim() : null;
          yield {
            senderId,
            recipientId: null,
            ownerAccountId: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null,
            timestamp: msg.timestamp,
            messageMid,
            text,
            attachments: [],
            isEcho: false
          };
        }
      }
    }
  }

  async receiveMessage(raw: unknown): Promise<{
    externalEventId: string;
    idempotencyKey: string;
    externalMessageId: string;
    externalUserId: string;
    channelThreadId: string;
    text: string;
    occurredAt: string;
    metadataJson?: Record<string, unknown>;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
    profileDiagnostics?: { profileLookupAttempted: boolean; profileLookupSucceeded: boolean };
    messageType?: "TEXT" | "IMAGE";
    mediaUrl?: string | null;
    previewUrl?: string | null;
  }> {
    const payload = raw as Parameters<InstagramAdapter["iterateMessagingEvents"]>[0];
    const configuredSelfIds = new Set(
      [
        this.config.businessAccountId,
        this.config.pageId,
        process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
        process.env.INSTAGRAM_ACCOUNT_ID,
        process.env.INSTAGRAM_PAGE_ID,
        process.env.FACEBOOK_PAGE_ID
      ]
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    );

    let sawInstagramAttachmentUnsupported = false;
    for (const event of this.iterateMessagingEvents(payload)) {
      if (event.isEcho) continue;
      // Some webhook variants may omit is_echo but still contain own-account messages.
      if (
        (event.ownerAccountId && event.senderId === event.ownerAccountId) ||
        configuredSelfIds.has(event.senderId) ||
        (event.recipientId && configuredSelfIds.has(event.recipientId))
      ) {
        continue;
      }

      const imageUrl = extractFirstHttpsImageUrlFromAttachments(event.attachments);
      const trimmedText = event.text.trim();

      if (imageUrl) {
        const timestamp = event.timestamp ?? Date.now();
        const occurredAt = parseMetaTimestamp(timestamp);
        const hasMid = typeof event.messageMid === "string" && event.messageMid.trim().length > 0;
        const messageMid = hasMid ? event.messageMid!.trim() : `ig-message:${event.senderId}:${timestamp}`;
        const idempotencyKey = hasMid ? `instagram:${messageMid}` : `instagram:${event.senderId}:${timestamp}`;
        const profile = await this.fetchUserProfile(event.senderId);
        return {
          externalEventId: messageMid,
          idempotencyKey,
          externalMessageId: messageMid,
          externalUserId: event.senderId,
          channelThreadId: normalizeInstagramThreadId(event.senderId),
          text: trimmedText || "(image)",
          messageType: "IMAGE",
          occurredAt,
          mediaUrl: imageUrl,
          previewUrl: imageUrl,
          metadataJson: {
            instagramRecipientId: event.recipientId
          },
          profile,
          profileDiagnostics: {
            profileLookupAttempted: true,
            profileLookupSucceeded: Boolean(profile.name || profile.profileImageUrl)
          }
        };
      }

      if (!trimmedText) {
        if (event.attachments.length > 0) {
          sawInstagramAttachmentUnsupported = true;
        }
        continue;
      }
      const timestamp = event.timestamp ?? Date.now();
      const occurredAt = parseMetaTimestamp(timestamp);
      const hasMid = typeof event.messageMid === "string" && event.messageMid.trim().length > 0;
      const messageMid = hasMid ? event.messageMid!.trim() : `ig-message:${event.senderId}:${timestamp}`;
      const idempotencyKey = hasMid ? `instagram:${messageMid}` : `instagram:${event.senderId}:${timestamp}`;
      const profile = await this.fetchUserProfile(event.senderId);
      return {
        externalEventId: messageMid,
        idempotencyKey,
        externalMessageId: messageMid,
        externalUserId: event.senderId,
        channelThreadId: normalizeInstagramThreadId(event.senderId),
        text: trimmedText,
        messageType: "TEXT",
        occurredAt,
        metadataJson: {
          instagramRecipientId: event.recipientId
        },
        profile,
        profileDiagnostics: {
          profileLookupAttempted: true,
          profileLookupSucceeded: Boolean(profile.name || profile.profileImageUrl)
        }
      };
    }

    if (sawInstagramAttachmentUnsupported) {
      throw new Error(INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT);
    }
    throw new Error("Unsupported Instagram webhook event payload");
  }

  private async postInstagramMessagesEndpoint(input: {
    graphVersion: string;
    pageIdForUrl: string;
    graphPathForLog: string;
    recipientIgsid: string;
    channelThreadId: string;
    requestBody: Record<string, unknown>;
    outboundDebugContext?: { messageId: string; conversationId: string };
  }): Promise<{ externalMessageId: string }> {
    const url = `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.pageIdForUrl)}/messages?access_token=${encodeURIComponent(this.config.accessToken)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.requestBody)
    });

    const bodyText = await response.text();
    if (!response.ok) {
      const meta = parseMetaSendErrorBody(bodyText);
      instagramAdapterLogger.error(
        {
          channel: this.channel,
          providerThreadType: "INSTAGRAM_DM",
          httpStatus: response.status,
          metaErrorCode: meta.code ?? null,
          metaErrorSubcode: meta.error_subcode ?? null,
          metaErrorMessage: meta.message ?? null,
          metaErrorType: meta.type ?? null,
          fbtraceId: meta.fbtrace_id ?? null,
          graphPath: input.graphPathForLog,
          recipientIgsid: input.recipientIgsid,
          originalChannelThreadId: input.channelThreadId,
          outboundMessageId: input.outboundDebugContext?.messageId ?? null,
          conversationId: input.outboundDebugContext?.conversationId ?? null
        },
        "Instagram Send API error"
      );
      throw new InstagramGraphApiError(response.status, input.graphPathForLog, meta, bodyText);
    }

    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `instagram-send:${input.recipientIgsid}:${Date.now()}` };
  }

  async sendMessage(input: {
    pageId?: string | null;
    channelThreadId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    fileName?: string;
    fileSizeBytes?: number;
    width?: number;
    height?: number;
    outboundDebugContext?: { messageId: string; conversationId: string };
  }): Promise<{ externalMessageId: string }> {
    const mt = input.messageType ?? "TEXT";

    const recipientIgsid = extractInstagramRecipientIgsidFromThreadId(input.channelThreadId);
    if (!recipientIgsid) {
      throw new Error(
        `Instagram outbound target is invalid. Expected numeric IGSID in format ig:user:<IGSID>, got: ${input.channelThreadId}`
      );
    }

    if (mt === "DOCUMENT_PDF") {
      throw new Error(INSTAGRAM_OUTBOUND_PDF_NOT_SUPPORTED);
    }

    if (mt === "TEXT") {
      if (
        input.mediaUrl ||
        input.previewUrl ||
        input.mediaMimeType ||
        input.fileName != null ||
        input.fileSizeBytes != null ||
        input.width != null ||
        input.height != null
      ) {
        throw new Error(INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE);
      }

      const trimmedText = input.content.trim();
      if (!trimmedText.length) {
        throw new Error("Instagram DM outbound text cannot be empty.");
      }

      const textUtf8Bytes = new TextEncoder().encode(trimmedText).length;
      if (textUtf8Bytes > 1000) {
        throw new Error("Instagram DM message text must be at most 1000 bytes (UTF-8).");
      }
    } else if (mt === "IMAGE") {
      const mediaIssue = validateInstagramOutboundImageMedia({
        mediaUrl: input.mediaUrl,
        mediaMimeType: input.mediaMimeType,
        fileSizeBytes: input.fileSizeBytes,
        requiresHttpsUrlMessage: INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL,
        unsupportedMimeMessage: INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME
      });
      if (mediaIssue) {
        throw new Error(mediaIssue);
      }

      const captionToSend = instagramDmOutboundCaptionToSend(input.content);
      if (captionToSend) {
        const captionBytes = new TextEncoder().encode(captionToSend).length;
        if (captionBytes > 1000) {
          throw new Error("Instagram DM message text must be at most 1000 bytes (UTF-8).");
        }
      }
    } else {
      throw new Error(INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE);
    }

    assertLikelyGraphPageAccessToken(this.config.accessToken);

    const graphVersion = normalizeGraphVersion(
      this.config.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
    );
    const pageIdForUrl = (this.config.pageId?.trim() || "").trim();
    if (!pageIdForUrl) {
      throw new Error("Instagram outbound requires FACEBOOK_PAGE_ID or INSTAGRAM_PAGE_ID in worker environment.");
    }

    const graphPathForLog = `/${graphVersion}/${pageIdForUrl}/messages`;

    if (mt === "TEXT") {
      const trimmedText = input.content.trim();
      const textUtf8Bytes = new TextEncoder().encode(trimmedText).length;

      instagramAdapterLogger.info(
        {
          message: "Instagram outbound prepared",
          channel: this.channel,
          providerThreadType: "INSTAGRAM_DM",
          messageId: input.outboundDebugContext?.messageId ?? null,
          conversationId: input.outboundDebugContext?.conversationId ?? null,
          recipientIgsid,
          graphVersion,
          messageType: mt,
          textLengthBytes: textUtf8Bytes,
          outboundGraphPageId: pageIdForUrl.length ? pageIdForUrl : null
        },
        "Instagram outbound prepared"
      );

      return await this.postInstagramMessagesEndpoint({
        graphVersion,
        pageIdForUrl,
        graphPathForLog,
        recipientIgsid,
        channelThreadId: input.channelThreadId,
        outboundDebugContext: input.outboundDebugContext,
        requestBody: {
          recipient: { id: recipientIgsid },
          message: { text: trimmedText }
        }
      });
    }

    if (mt === "IMAGE") {
      const rawUrl = typeof input.mediaUrl === "string" ? input.mediaUrl.trim() : "";
      const mimeType = typeof input.mediaMimeType === "string" ? input.mediaMimeType.trim().toLowerCase() : "";
      const captionFollowUp = instagramDmOutboundCaptionToSend(input.content);
      const messagingType = "RESPONSE" as const;
      instagramAdapterLogger.info(
        {
          message: "Instagram outbound prepared",
          channel: this.channel,
          providerThreadType: "INSTAGRAM_DM",
          messageId: input.outboundDebugContext?.messageId ?? null,
          conversationId: input.outboundDebugContext?.conversationId ?? null,
          recipientIgsid,
          graphVersion,
          messageType: mt,
          outboundGraphPageId: pageIdForUrl.length ? pageIdForUrl : null,
          mediaMimeType: mimeType,
          captionFollowUp: Boolean(captionFollowUp)
        },
        "Instagram outbound prepared"
      );

      const imageResult = await this.postInstagramMessagesEndpoint({
        graphVersion,
        pageIdForUrl,
        graphPathForLog,
        recipientIgsid,
        channelThreadId: input.channelThreadId,
        outboundDebugContext: input.outboundDebugContext,
        requestBody: {
          recipient: { id: recipientIgsid },
          messaging_type: messagingType,
          message: {
            attachment: {
              type: "image",
              payload: { url: rawUrl }
            }
          }
        }
      });

      if (captionFollowUp) {
        instagramAdapterLogger.info(
          {
            message: "Instagram outbound caption follow-up",
            channel: this.channel,
            providerThreadType: "INSTAGRAM_DM",
            messageId: input.outboundDebugContext?.messageId ?? null,
            conversationId: input.outboundDebugContext?.conversationId ?? null,
            recipientIgsid,
            graphVersion,
            textLengthBytes: new TextEncoder().encode(captionFollowUp).length
          },
          "Instagram outbound caption follow-up"
        );
        try {
          await this.postInstagramMessagesEndpoint({
            graphVersion,
            pageIdForUrl,
            graphPathForLog,
            recipientIgsid,
            channelThreadId: input.channelThreadId,
            outboundDebugContext: input.outboundDebugContext,
            requestBody: {
              recipient: { id: recipientIgsid },
              message: { text: captionFollowUp }
            }
          });
        } catch (captionErr) {
          const graphErr = captionErr instanceof InstagramGraphApiError ? captionErr : null;
          instagramAdapterLogger.error(
            {
              message: "Instagram DM caption follow-up failed after image was sent",
              channel: this.channel,
              providerThreadType: "INSTAGRAM_DM",
              conversationId: input.outboundDebugContext?.conversationId ?? null,
              messageId: input.outboundDebugContext?.messageId ?? null,
              recipientIgsid,
              graphPath: graphPathForLog,
              httpStatus: graphErr?.httpStatus ?? null,
              metaErrorCode: graphErr?.meta.code ?? null,
              metaErrorSubcode: graphErr?.meta.error_subcode ?? null,
              metaErrorMessage: graphErr?.meta.message ?? null,
              metaErrorType: graphErr?.meta.type ?? null,
              fbtraceId: graphErr?.meta.fbtrace_id ?? null,
              nonGraphError:
                captionErr instanceof Error && !graphErr
                  ? { name: captionErr.name, message: captionErr.message }
                  : null
            },
            "Instagram DM caption follow-up failed after image was sent (image already delivered; returning image externalMessageId)"
          );
          /** Best-effort caption: do not rethrow — avoids worker retry resending the image. */
        }
      }

      return imageResult;
    }

    const _exhaustive: never = mt;
    return _exhaustive;
  }

  async fetchUserProfile(externalUserId: string): Promise<{
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  }> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${normalizeGraphVersion(
          this.config.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
        )}/${encodeURIComponent(externalUserId)}?fields=name,profile_pic&access_token=${encodeURIComponent(this.config.accessToken)}`
      );
      if (!response.ok) return {};
      const body = (await response.json()) as { name?: unknown; profile_pic?: unknown };
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
      const profileImageUrl =
        typeof body.profile_pic === "string" && body.profile_pic.trim() ? body.profile_pic.trim() : undefined;
      return {
        ...(name ? { name } : {}),
        ...(profileImageUrl ? { profileImageUrl, avatarUrl: profileImageUrl } : {})
      };
    } catch {
      return {};
    }
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
