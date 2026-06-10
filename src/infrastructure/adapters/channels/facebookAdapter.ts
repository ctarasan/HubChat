import type { ChannelAdapter } from "../../../domain/ports.js";
import pino from "pino";
import { parseMetaTimestamp } from "../../../domain/dateUtils.js";
import { isFacebookCommentThreadTarget, isValidFacebookMessengerSendTarget, resolveFacebookMessengerRecipientPsid } from "../../../domain/facebookThreadTargets.js";
import { resolveSourcePostMetadataForInbound } from "../../../lib/sourcePostIngestEnrichment.js";

const logger = pino({ name: "facebook-adapter" });
const FACEBOOK_PUBLIC_COMMENT_REPLY_TEXT = "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ";
const FACEBOOK_DEBUG_PUBLIC_REPLY = process.env.FACEBOOK_DEBUG_PUBLIC_REPLY === "true";
const FACEBOOK_GRAPH_VERSION = "v25.0";

interface FacebookConfig {
  pageAccessToken?: string;
  graphVersion?: string;
}

export class FacebookAdapter implements ChannelAdapter {
  readonly channel = "FACEBOOK" as const;

  constructor(private readonly config: FacebookConfig) {}

  private tokenFingerprintLast8(): string | null {
    const token = this.config.pageAccessToken?.trim();
    if (!token) return null;
    return token.slice(-8);
  }

  private resolveGraphVersion(): string {
    const raw = (this.config.graphVersion ?? process.env.FACEBOOK_GRAPH_VERSION ?? FACEBOOK_GRAPH_VERSION).trim();
    if (!raw) return FACEBOOK_GRAPH_VERSION;
    if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
    if (/^v\d+\.\d+$/i.test(raw)) return `v${raw.slice(1)}`;
    return raw.startsWith("v") ? raw : `v${raw}`;
  }

  private parseMessengerRecipientId(channelThreadId: string): string {
    const trimmed = channelThreadId.trim();
    return trimmed.startsWith("user:") ? trimmed.slice(5).trim() : trimmed;
  }

  private maskIdForLog(value: string | null | undefined): string | null {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return null;
    const prefix = trimmed.slice(0, Math.min(4, trimmed.length));
    return `${prefix}…len=${trimmed.length}`;
  }

  private assertHttpsUrl(value: string, fieldName: string): void {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Facebook outbound ${fieldName} must be HTTPS`);
    }
  }

  private pickTextCandidate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private pickHttpsCandidate(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      if (new URL(trimmed).protocol === "https:") return trimmed;
    } catch {
      return null;
    }
    return null;
  }

  private extractCommentText(value: {
    message?: unknown;
    comment_text?: unknown;
    text?: unknown;
    comment?: { message?: unknown; text?: unknown };
  }): string | null {
    return (
      this.pickTextCandidate(value.message) ??
      this.pickTextCandidate(value.comment_text) ??
      this.pickTextCandidate(value.text) ??
      this.pickTextCandidate(value.comment?.message) ??
      this.pickTextCandidate(value.comment?.text) ??
      null
    );
  }

  private async fetchCommentTextFromGraph(commentId: string): Promise<string | null> {
    if (!this.config.pageAccessToken) {
      console.warn("[facebook-adapter] FACEBOOK_PAGE_ACCESS_TOKEN missing; cannot fetch comment text", { commentId });
      return null;
    }

    try {
      const graphVersion = this.resolveGraphVersion();
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(commentId)}?fields=message&access_token=${encodeURIComponent(this.config.pageAccessToken)}`
      );
      if (!response.ok) {
        const body = await response.text();
        console.warn("[facebook-adapter] Graph API comment lookup failed", { commentId, status: response.status, body });
        return null;
      }

      const parsed = (await response.json()) as { message?: unknown };
      return this.pickTextCandidate(parsed.message);
    } catch (error) {
      console.warn("[facebook-adapter] Graph API comment lookup threw", { commentId, error });
      return null;
    }
  }

  private extractCommentAttachment(value: {
    photo?: unknown;
    image?: unknown;
    attachment?: {
      type?: unknown;
      media?: {
        image?: { src?: unknown };
        source?: unknown;
      };
      target?: { url?: unknown };
      url?: unknown;
    };
    permalink_url?: unknown;
    permalinkUrl?: unknown;
  }): { thumbnailUrl: string | null; fullImageUrl: string | null; permalinkUrl: string | null; attachmentType: string | null } {
    const thumbnailUrl =
      this.pickHttpsCandidate(value.photo) ??
      this.pickHttpsCandidate(value.image) ??
      this.pickHttpsCandidate(value.attachment?.media?.image?.src) ??
      this.pickHttpsCandidate(value.attachment?.url) ??
      this.pickHttpsCandidate(value.attachment?.target?.url) ??
      null;
    const fullImageUrl =
      this.pickHttpsCandidate(value.attachment?.media?.source) ??
      this.pickHttpsCandidate(value.attachment?.target?.url) ??
      this.pickHttpsCandidate(value.attachment?.url) ??
      thumbnailUrl;
    const permalinkUrl = this.pickHttpsCandidate(value.permalink_url) ?? this.pickHttpsCandidate(value.permalinkUrl) ?? null;
    const attachmentType = typeof value.attachment?.type === "string" ? value.attachment.type.trim().toLowerCase() : null;
    return { thumbnailUrl, fullImageUrl, permalinkUrl, attachmentType };
  }

  private async fetchCommentDetailFromGraph(commentId: string): Promise<{
    text: string | null;
    thumbnailUrl: string | null;
    fullImageUrl: string | null;
    permalinkUrl: string | null;
    attachmentType: string | null;
    rawPayload: Record<string, unknown> | null;
  }> {
    if (!this.config.pageAccessToken) {
      return { text: null, thumbnailUrl: null, fullImageUrl: null, permalinkUrl: null, attachmentType: null, rawPayload: null };
    }
    try {
      const graphVersion = this.resolveGraphVersion();
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(commentId)}?fields=id,message,created_time,from,attachment,permalink_url&access_token=${encodeURIComponent(this.config.pageAccessToken)}`
      );
      if (!response.ok) {
        const body = await response.text();
        console.warn("[facebook-adapter] Graph API comment detail lookup failed", { commentId, status: response.status, body });
        return { text: null, thumbnailUrl: null, fullImageUrl: null, permalinkUrl: null, attachmentType: null, rawPayload: null };
      }
      const parsed = (await response.json()) as Record<string, unknown>;
      const attachment = this.extractCommentAttachment(parsed as any);
      return {
        text: this.pickTextCandidate(parsed.message),
        thumbnailUrl: attachment.thumbnailUrl,
        fullImageUrl: attachment.fullImageUrl,
        permalinkUrl: attachment.permalinkUrl,
        attachmentType: attachment.attachmentType,
        rawPayload: parsed
      };
    } catch (error) {
      console.warn("[facebook-adapter] Graph API comment detail lookup threw", { commentId, error });
      return { text: null, thumbnailUrl: null, fullImageUrl: null, permalinkUrl: null, attachmentType: null, rawPayload: null };
    }
  }

  private buildDisplayNameFromGraphBody(body: {
    name?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  }): string | null {
    const direct = typeof body.name === "string" ? body.name.trim() : "";
    if (direct.length > 0) return direct;
    const first = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const last = typeof body.last_name === "string" ? body.last_name.trim() : "";
    const combined = [first, last].filter(Boolean).join(" ").trim();
    return combined.length > 0 ? combined : null;
  }

  private async fetchMessengerUserProfileFromGraph(userId: string): Promise<{ name: string | null; profileImageUrl: string | null }> {
    if (!this.config.pageAccessToken) return { name: null, profileImageUrl: null };
    try {
      const graphVersion = this.resolveGraphVersion();
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(userId)}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(this.config.pageAccessToken)}`
      );
      if (!response.ok) return { name: null, profileImageUrl: null };
      const body = (await response.json()) as { name?: unknown; first_name?: unknown; last_name?: unknown; profile_pic?: unknown };
      const name = this.buildDisplayNameFromGraphBody(body);
      const picRaw = typeof body.profile_pic === "string" ? body.profile_pic.trim() : "";
      let profileImageUrl: string | null = null;
      if (picRaw.length > 0) {
        try {
          if (new URL(picRaw).protocol === "https:") profileImageUrl = picRaw;
        } catch {
          profileImageUrl = null;
        }
      }
      return { name, profileImageUrl };
    } catch {
      return { name: null, profileImageUrl: null };
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
    sourceThreadType?: "MESSENGER_DM" | "FACEBOOK_COMMENT";
    facebookPageId?: string | null;
    facebookPostId?: string | null;
    facebookCommentId?: string | null;
    profile?: { name?: string; phone?: string; email?: string; avatarUrl?: string; profileImageUrl?: string };
    profileDiagnostics?: { profileLookupAttempted: boolean; profileLookupSucceeded: boolean };
    messageType?: "TEXT" | "IMAGE";
    mediaUrl?: string | null;
    previewUrl?: string | null;
    metadataJson?: Record<string, unknown>;
  }> {
    const payload = raw as {
      entry?: Array<{
        id?: string;
        messaging?: Array<{
          sender?: { id?: string };
          recipient?: { id?: string };
          timestamp?: number;
          message?: {
            mid?: string;
            text?: string;
            is_echo?: boolean;
            attachments?: Array<{ type?: string; payload?: { url?: string } }>;
          };
        }>;
        changes?: Array<{
          field?: string;
          value?: {
            from?: { id?: string; name?: string };
            sender_id?: string;
            sender?: { id?: string };
            post_id?: string;
            parent_id?: string;
            comment_id?: string;
            message?: string;
            item?: string;
            verb?: string;
            comment_text?: string;
            text?: string;
            comment?: { message?: string; text?: string };
            attachment?: {
              type?: string;
              media?: { image?: { src?: string }; source?: string };
              target?: { url?: string };
              url?: string;
            };
            photo?: string;
            image?: string;
            permalink_url?: string;
            permalinkUrl?: string;
            time?: number;
            created_time?: string;
          };
        }>;
      }>;
    };

    for (const entry of payload.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        if (!msg.sender?.id || !msg.message) continue;
        if (msg.message.is_echo) continue;

        const textValue = typeof msg.message.text === "string" ? msg.message.text.trim() : "";
        const attachmentType = msg.message.attachments?.[0]?.type;
        const attachmentUrl = this.pickHttpsCandidate(msg.message.attachments?.[0]?.payload?.url);
        if (!textValue && !attachmentType) continue;

        const senderId = msg.sender.id;
        const timestamp = msg.timestamp ?? Date.now();
        const occurredAt = parseMetaTimestamp(timestamp);
        const messageMid = msg.message?.mid ?? `fb-message:${senderId}:${timestamp}`;
        const messageType = attachmentType === "image" && attachmentUrl ? "IMAGE" : "TEXT";
        const text = textValue || (messageType === "IMAGE" ? "" : `[${attachmentType}]`);

        const profileLookupAttempted = Boolean(this.config.pageAccessToken);
        const graphProfile = await this.fetchMessengerUserProfileFromGraph(senderId);
        const displayName = graphProfile.name;
        const profileImageUrl = graphProfile.profileImageUrl;
        const profileLookupSucceeded = profileLookupAttempted && (Boolean(displayName) || Boolean(profileImageUrl));

        logger.info(
          {
            provider: "FACEBOOK",
            messageId: messageMid,
            hasImageUrl: Boolean(attachmentUrl),
            externalUserId: senderId,
            displayNamePresent: Boolean(displayName),
            profileImagePresent: Boolean(profileImageUrl),
            profileLookupAttempted,
            profileLookupSucceeded
          },
          "Facebook inbound profile lookup"
        );

        const profile =
          displayName || profileImageUrl
            ? {
                ...(displayName ? { name: displayName } : {}),
                ...(profileImageUrl ? { profileImageUrl: profileImageUrl, avatarUrl: profileImageUrl } : {})
              }
            : undefined;

        return {
          externalEventId: messageMid,
          idempotencyKey: `facebook:${messageMid}`,
          externalMessageId: messageMid,
          externalUserId: senderId,
          channelThreadId: senderId,
          text,
          occurredAt,
          sourceThreadType: "MESSENGER_DM",
          messageType,
          mediaUrl: attachmentUrl,
          previewUrl: attachmentUrl,
          facebookPageId: entry.id ?? msg.recipient?.id ?? null,
          facebookPostId: null,
          facebookCommentId: null,
          profile,
          profileDiagnostics: {
            profileLookupAttempted,
            profileLookupSucceeded
          }
        };
      }
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "feed" && change.field !== "comments") continue;
        const value = change.value;
        const commenterId = value?.from?.id ?? value?.sender_id ?? value?.sender?.id;
        if (!commenterId) continue;
        const timestamp = value?.time ? Number(value.time) : undefined;
        const occurredAt = value?.created_time
          ? parseMetaTimestamp(value.created_time)
          : parseMetaTimestamp(timestamp);
        const commentId = value?.comment_id ?? `fb-comment:${commenterId}:${occurredAt}`;
        const payloadText = value ? this.extractCommentText(value) : null;
        const payloadAttachment = value
          ? this.extractCommentAttachment(value)
          : { thumbnailUrl: null, fullImageUrl: null, permalinkUrl: null, attachmentType: null };
        const needsGraphDetail = Boolean(value?.comment_id && (!payloadText || !payloadAttachment.fullImageUrl));
        const graphDetail = needsGraphDetail && value?.comment_id
          ? await this.fetchCommentDetailFromGraph(value.comment_id)
          : {
              text: null,
              thumbnailUrl: null,
              fullImageUrl: null,
              permalinkUrl: null,
              attachmentType: null,
              rawPayload: null
            };
        const graphText = !payloadText && value?.comment_id ? await this.fetchCommentTextFromGraph(value.comment_id) : null;
        const resolvedThumbnailUrl = payloadAttachment.thumbnailUrl ?? graphDetail.thumbnailUrl;
        const resolvedFullImageUrl = payloadAttachment.fullImageUrl ?? graphDetail.fullImageUrl;
        const messageType = resolvedFullImageUrl ? "IMAGE" : "TEXT";
        const text = payloadText ?? graphDetail.text ?? graphText ?? (resolvedFullImageUrl ? "" : (value?.item ? `[${value.item}]` : "[comment]"));
        const threadId = value?.comment_id ?? value?.parent_id ?? value?.post_id ?? commenterId;

        const payloadName =
          typeof value?.from?.name === "string" && value.from.name.trim() ? value.from.name.trim() : null;
        const profileLookupAttempted = Boolean(this.config.pageAccessToken && commenterId);
        const graphProfile = commenterId ? await this.fetchMessengerUserProfileFromGraph(commenterId) : { name: null, profileImageUrl: null };
        const displayName = payloadName ?? graphProfile.name;
        const profileImageUrl = graphProfile.profileImageUrl;
        const profileLookupSucceeded = profileLookupAttempted && (Boolean(displayName) || Boolean(profileImageUrl));

        logger.info(
          {
            provider: "FACEBOOK",
            externalUserId: commenterId,
            displayNamePresent: Boolean(displayName),
            profileImagePresent: Boolean(profileImageUrl),
            profileLookupAttempted,
            profileLookupSucceeded
          },
          "Facebook inbound profile lookup"
        );

        const profile =
          displayName || profileImageUrl
            ? {
                ...(displayName ? { name: displayName } : {}),
                ...(profileImageUrl ? { profileImageUrl: profileImageUrl, avatarUrl: profileImageUrl } : {})
              }
            : undefined;

        const postId = typeof value?.post_id === "string" ? value.post_id.trim() : "";
        const sourcePostResolved = await resolveSourcePostMetadataForInbound({
          channel: "FACEBOOK",
          messageType,
          sourceThreadType: "FACEBOOK_COMMENT",
          payloadMetadataJson: {},
          facebookPostId: postId || null,
          capturedAt: occurredAt,
          pageAccessToken: this.config.pageAccessToken ?? null
        });
        logger.info(
          {
            provider: "FACEBOOK",
            inboundKind: "comment",
            ...sourcePostResolved.diagnostics
          },
          "source_post_ingest_enrichment"
        );

        return {
          externalEventId: commentId,
          idempotencyKey: `facebook:${commentId}`,
          externalMessageId: commentId,
          externalUserId: commenterId,
          channelThreadId: threadId,
          text,
          occurredAt,
          sourceThreadType: "FACEBOOK_COMMENT",
          messageType,
          mediaUrl: resolvedFullImageUrl ?? null,
          previewUrl: resolvedThumbnailUrl ?? resolvedFullImageUrl ?? null,
          metadataJson: sourcePostResolved.metadata,
          facebookPageId: entry.id ?? null,
          facebookPostId: value?.post_id ?? null,
          facebookCommentId: value?.comment_id ?? null,
          profile,
          profileDiagnostics: {
            profileLookupAttempted,
            profileLookupSucceeded
          }
        };
      }
    }

    throw new Error("Unsupported Facebook webhook event payload");
  }

  async sendMessage(input: {
    pageId?: string | null;
    channelThreadId: string;
    providerExternalUserId?: string | null;
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
    if (!this.config.pageAccessToken) {
      throw new Error("Facebook page access token is not configured");
    }

    const trimmedTarget = input.channelThreadId?.trim();
    if (!trimmedTarget) throw new Error("Facebook outbound target is empty");
    if (
      isFacebookCommentThreadTarget(trimmedTarget) ||
      !isValidFacebookMessengerSendTarget(trimmedTarget, input.providerExternalUserId, { allowRawPsid: true })
    ) {
      throw new Error("Invalid Facebook Messenger send target: got Facebook comment thread id. Resolve DM route before calling sendMessage.");
    }
    const recipientId =
      resolveFacebookMessengerRecipientPsid(trimmedTarget, input.providerExternalUserId) ??
      this.parseMessengerRecipientId(trimmedTarget);
    if (!recipientId) throw new Error("Facebook outbound target is empty");
    if (recipientId.includes("_") || recipientId.startsWith("comment:")) {
      throw new Error("Invalid Facebook Messenger send target: got Facebook comment thread id. Resolve DM route before calling sendMessage.");
    }

    const messageType = input.messageType ?? "TEXT";
    if (messageType === "IMAGE" && !input.mediaUrl) {
      throw new Error("Facebook Messenger image outbound requires mediaUrl");
    }
    if (messageType === "DOCUMENT_PDF" && !input.mediaUrl) {
      throw new Error("Facebook Messenger document outbound requires mediaUrl");
    }
    if (messageType === "IMAGE" && typeof input.fileSizeBytes === "number" && input.fileSizeBytes > 8 * 1024 * 1024) {
      throw new Error("Facebook Messenger image outbound supports up to 8MB for URL-based attachment");
    }
    if (messageType === "IMAGE" || messageType === "DOCUMENT_PDF") {
      this.assertHttpsUrl(input.mediaUrl ?? "", "mediaUrl");
    }

    const pageId = (input.pageId ?? "").trim();
    if (!pageId) {
      logger.warn("Facebook Messenger send without conversation pageId; using page access token /me endpoint");
    }

    const graphVersion = this.resolveGraphVersion();
    const endpointPath = `/${graphVersion}/me/messages`;
    const messagingType = "RESPONSE" as const;
    const recipientSource = (input.providerExternalUserId ?? "").trim()
      ? "provider_external_user_id"
      : trimmedTarget.startsWith("user:")
        ? "user_prefixed_psid"
        : "raw_psid";
    const tokenFingerprintLast8 = this.tokenFingerprintLast8();
    const requestPayload =
      messageType === "IMAGE"
        ? {
            recipient: { id: recipientId },
            messaging_type: messagingType,
            message: {
              attachment: {
                type: "image",
                payload: {
                  url: input.mediaUrl,
                  is_reusable: true
                }
              }
            }
          }
        : messageType === "DOCUMENT_PDF"
          ? {
              recipient: { id: recipientId },
              messaging_type: messagingType,
              message: {
                attachment: {
                  type: "file",
                  payload: {
                    url: input.mediaUrl,
                    is_reusable: true
                  }
                }
              }
            }
          : {
              recipient: { id: recipientId },
              messaging_type: messagingType,
              message: { text: input.content }
            };
    logger.info(
      {
        graphVersion,
        endpointPath,
        pageId: pageId || null,
        pageIdMasked: this.maskIdForLog(pageId),
        channelThreadId: trimmedTarget,
        channelThreadIdMasked: this.maskIdForLog(trimmedTarget),
        recipientIdMasked: this.maskIdForLog(recipientId),
        recipientSource,
        messagingType,
        messageType,
        contentLength: input.content.length,
        hasMediaUrl: Boolean(input.mediaUrl),
        tokenFingerprintLast8
      },
      "Facebook Messenger send request"
    );
    logger.info(
      {
        recipient: { idMasked: this.maskIdForLog(recipientId) },
        messaging_type: messagingType,
        messageShape: {
          hasText: typeof requestPayload.message?.text === "string" && requestPayload.message.text.length > 0,
          textLength: typeof requestPayload.message?.text === "string" ? requestPayload.message.text.length : 0,
          hasAttachment: Boolean(requestPayload.message?.attachment),
          attachmentType: (requestPayload.message?.attachment?.type as string | undefined) ?? null
        }
      },
      "Facebook Messenger send request body shape"
    );

    const response = await fetch(
      `https://graph.facebook.com${endpointPath}?access_token=${encodeURIComponent(this.config.pageAccessToken)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload)
      }
    );
    const bodyText = await response.text();
    if (!response.ok) {
      let metaError: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } | null = null;
      try {
        const parsed = JSON.parse(bodyText) as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };
        metaError = parsed.error ?? null;
      } catch {
        metaError = null;
      }
      logger.error(
        {
          httpStatus: response.status,
          graphVersion,
          endpointPath,
          pageId: pageId || null,
          pageIdMasked: this.maskIdForLog(pageId),
          recipientIdMasked: this.maskIdForLog(recipientId),
          tokenFingerprintLast8,
          metaMessage: metaError?.message ?? null,
          metaCode: metaError?.code ?? null,
          metaSubcode: metaError?.error_subcode ?? null,
          fbtraceId: metaError?.fbtrace_id ?? null
        },
        "Facebook Messenger send failed"
      );
      throw new Error(
        `Facebook Send API failed (${response.status}) [graphVersion=${graphVersion} endpointPath=${endpointPath} pageIdMasked=${this.maskIdForLog(pageId) ?? "null"} recipientIdMasked=${this.maskIdForLog(recipientId) ?? "null"} tokenLast8=${tokenFingerprintLast8 ?? "null"} metaCode=${metaError?.code ?? "null"} metaSubcode=${metaError?.error_subcode ?? "null"} fbtraceId=${metaError?.fbtrace_id ?? "null"}]: ${bodyText}`
      );
    }

    const parsed = JSON.parse(bodyText) as { message_id?: string };
    return { externalMessageId: parsed.message_id ?? `facebook-send:${recipientId}:${Date.now()}` };
  }

  async sendPrivateReply(input: {
    pageId?: string | null;
    commentId: string;
    content: string;
    idempotencyKey: string;
    messageType?: "TEXT" | "IMAGE" | "DOCUMENT_PDF";
  }): Promise<{ externalMessageId: string }> {
    if (!this.config.pageAccessToken) {
      throw new Error("Cannot send private reply: missing Facebook page access token.");
    }
    const commentId = (input.commentId ?? "").trim();
    if (!commentId) {
      throw new Error("Cannot send private reply: missing Facebook comment ID.");
    }
    const messageType = input.messageType ?? "TEXT";
    if (messageType !== "TEXT") {
      throw new Error("First Facebook comment reply must be text only.");
    }
    const messageText = input.content.trim();
    if (!messageText) {
      throw new Error("First Facebook comment reply must be text only.");
    }

    const endpointPageId = input.pageId?.trim();
    if (!endpointPageId) {
      throw new Error("Cannot send private reply: missing Facebook page ID.");
    }
    const graphVersion = this.resolveGraphVersion();
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(endpointPageId)}/messages?access_token=${encodeURIComponent(this.config.pageAccessToken)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          messaging_type: "RESPONSE",
          message: { text: messageText }
        })
      }
    );
    const bodyText = await response.text();
    let parsed: { message_id?: string; error?: { message?: string; code?: number; type?: string; fbtrace_id?: string } };
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      if (!response.ok) {
        throw new Error(`Facebook Private Reply API invalid JSON (${response.status}): ${bodyText.slice(0, 500)}`);
      }
      throw new Error(`Facebook Private Reply API invalid success payload: ${bodyText.slice(0, 500)}`);
    }
    if (parsed.error) {
      throw new Error(`Facebook Private Reply API error: ${JSON.stringify(parsed.error)}`);
    }
    if (!response.ok) {
      throw new Error(`Facebook Private Reply API failed (${response.status}): ${bodyText.slice(0, 500)}`);
    }
    return { externalMessageId: parsed.message_id ?? `facebook-private-reply:${commentId}:${Date.now()}` };
  }

  async sendPublicCommentReply(input: {
    pageId: string;
    commentId: string;
    text: string;
  }): Promise<{ externalMessageId: string }> {
    if (!this.config.pageAccessToken) {
      throw new Error("Cannot send public comment reply: missing Facebook page access token.");
    }
    const pageId = (input.pageId ?? "").trim();
    if (!pageId) {
      throw new Error("Cannot send public comment reply: missing Facebook page ID.");
    }
    const commentId = (input.commentId ?? "").trim();
    if (!commentId) {
      throw new Error("Cannot send public comment reply: missing Facebook comment ID.");
    }
    const messageText = (input.text ?? "").trim() || FACEBOOK_PUBLIC_COMMENT_REPLY_TEXT;
    const accessToken = this.config.pageAccessToken;
    logger.info(
      {
        commentId,
        pageId,
        hasToken: Boolean(accessToken)
      },
      "Facebook public reply input"
    );
    const graphVersion = this.resolveGraphVersion();
    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(commentId)}/comments`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: messageText,
        access_token: accessToken
      })
    });
    const responseText = await response.text();
    if (FACEBOOK_DEBUG_PUBLIC_REPLY) {
      logger.info(
        {
          status: response.status,
          body: responseText,
          commentId,
          pageId
        },
        "Facebook public reply response"
      );
    }
    if (!response.ok) {
      throw new Error(`Facebook public reply failed: ${response.status} ${responseText}`);
    }
    const bodyText = responseText;
    let parsed: { id?: string; error?: { message?: string; code?: number; type?: string } };
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      throw new Error(`Facebook Public Comment Reply API invalid JSON (${response.status}): ${bodyText.slice(0, 500)}`);
    }
    if (parsed.error) {
      throw new Error(`Facebook Public Comment Reply API error: ${JSON.stringify(parsed.error)}`);
    }
    if (!parsed.id || typeof parsed.id !== "string") {
      throw new Error(`Facebook Public Comment Reply API missing id: ${bodyText}`);
    }
    logger.info({ commentId, pageId }, "Facebook public comment reply sent");
    return { externalMessageId: parsed.id };
  }

  async fetchUserProfile(_externalUserId: string): Promise<{
    name?: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    profileImageUrl?: string;
  }> {
    return { name: "Facebook User" };
  }

  async fetchConversationThread(_channelThreadId: string): Promise<Array<{ externalMessageId: string; content: string }>> {
    return [];
  }
}
