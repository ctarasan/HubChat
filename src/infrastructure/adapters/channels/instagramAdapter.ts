import type { ChannelAdapter } from "../../../domain/ports.js";
import { parseMetaTimestamp } from "../../../domain/dateUtils.js";
import pino from "pino";
import { InstagramGraphApiError } from "./instagramGraphApiError.js";

interface InstagramConfig {
  /** Facebook Page access token for `/me/messages` or `/{page-id}/messages` (not Instagram Login IGA tokens). */
  accessToken: string;
  graphVersion?: string;
  /** Optional Instagram Business Account id — used elsewhere; outbound uses Page token + me/page path. */
  businessAccountId?: string;
  /** When set, POST `/{page-id}/messages` instead of `/me/messages`. */
  pageId?: string;
}

export { InstagramGraphApiError } from "./instagramGraphApiError.js";

const instagramAdapterLogger = pino({ name: "instagram-adapter" });

/** Phase 1: Instagram DM outbound is text-only (shared copy with outbound use case). */
export const INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE = "Instagram DM Phase 1 supports text messages only.";

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
    messageType?: "TEXT";
  }> {
    const payload = raw as Parameters<InstagramAdapter["iterateMessagingEvents"]>[0];

    let sawInstagramMediaUnsupported = false;
    for (const event of this.iterateMessagingEvents(payload)) {
      if (event.isEcho) continue;
      if (!event.text) {
        if (event.attachments.length > 0) {
          sawInstagramMediaUnsupported = true;
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
        text: event.text,
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

    if (sawInstagramMediaUnsupported) {
      throw new Error("Instagram inbound media is not supported in this phase");
    }
    throw new Error("Unsupported Instagram webhook event payload");
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
    if (mt !== "TEXT") {
      throw new Error(INSTAGRAM_PHASE1_TEXT_ONLY_MESSAGE);
    }
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

    const recipientIgsid = extractInstagramRecipientIgsidFromThreadId(input.channelThreadId);
    if (!recipientIgsid) {
      throw new Error(
        `Instagram outbound target is invalid. Expected numeric IGSID in format ig:user:<IGSID>, got: ${input.channelThreadId}`
      );
    }

    const trimmedText = input.content.trim();
    if (!trimmedText.length) {
      throw new Error("Instagram DM outbound text cannot be empty.");
    }

    const textUtf8Bytes = new TextEncoder().encode(trimmedText).length;
    if (textUtf8Bytes > 1000) {
      throw new Error("Instagram DM message text must be at most 1000 bytes (UTF-8).");
    }

    assertLikelyGraphPageAccessToken(this.config.accessToken);

    const graphVersion = normalizeGraphVersion(
      this.config.graphVersion ?? process.env.META_GRAPH_VERSION ?? process.env.FACEBOOK_GRAPH_VERSION
    );
    const pageIdForUrl = (input.pageId?.trim() || this.config.pageId?.trim() || "").trim();

    /** Path-only for logs (never include query tokens). */
    const graphPathForLog = pageIdForUrl.length
      ? `/${graphVersion}/${pageIdForUrl}/messages`
      : `/${graphVersion}/me/messages`;

    instagramAdapterLogger.info(
      {
        message: "Instagram outbound prepared",
        messageId: input.outboundDebugContext?.messageId ?? null,
        conversationId: input.outboundDebugContext?.conversationId ?? null,
        recipientIgsid,
        graphVersion,
        messageType: mt,
        textLengthBytes: textUtf8Bytes
      },
      "Instagram outbound prepared"
    );

    const url =
      pageIdForUrl.length > 0
        ? `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pageIdForUrl)}/messages?access_token=${encodeURIComponent(this.config.accessToken)}`
        : `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${encodeURIComponent(this.config.accessToken)}`;

    const requestBody = {
      recipient: { id: recipientIgsid },
      message: { text: trimmedText }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const bodyText = await response.text();
    if (!response.ok) {
      const meta = parseMetaSendErrorBody(bodyText);
      instagramAdapterLogger.error(
        {
          httpStatus: response.status,
          metaErrorCode: meta.code ?? null,
          metaErrorSubcode: meta.error_subcode ?? null,
          metaErrorMessage: meta.message ?? null,
          metaErrorType: meta.type ?? null,
          fbtraceId: meta.fbtrace_id ?? null,
          graphPath: graphPathForLog,
          recipientIgsid,
          originalChannelThreadId: input.channelThreadId,
          outboundMessageId: input.outboundDebugContext?.messageId ?? null,
          conversationId: input.outboundDebugContext?.conversationId ?? null
        },
        "Instagram Send API error"
      );
      throw new InstagramGraphApiError(response.status, graphPathForLog, meta, bodyText);
    }

    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `instagram-send:${recipientIgsid}:${Date.now()}` };
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
