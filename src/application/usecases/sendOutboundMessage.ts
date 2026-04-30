import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import pino from "pino";
import type {
  ActivityLogRepository,
  ChannelAdapter,
  ConversationRepository,
  IdempotencyPort,
  MessageRepository,
  RateLimiterPort
} from "../../domain/ports.js";
import type { ChannelType, Conversation } from "../../domain/entities.js";
import { isValidFacebookMessengerSendTarget } from "../../domain/facebookThreadTargets.js";

interface Dependencies {
  channelAdapterRegistry: {
    get: (channel: ChannelType) => ChannelAdapter;
  };
  conversationRepository?: ConversationRepository;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  rateLimiter: RateLimiterPort;
  idempotency: IdempotencyPort;
  onProviderLatencyMs?: (input: { tenantId: string; channel: ChannelType; messageId: string; latencyMs: number }) => void;
}

const logger = pino({ name: "send-outbound-usecase" });
const FACEBOOK_PUBLIC_REPLY_TEXT = "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ";
const FACEBOOK_OUTSIDE_WINDOW_USER_MESSAGE =
  "ไม่สามารถส่งข้อความผ่าน Messenger ได้ เนื่องจากอยู่นอกช่วงเวลาที่ Meta อนุญาตให้ตอบกลับ กรุณาให้ลูกค้าทัก Inbox ใหม่ หรือใช้ Private Reply จาก comment หากยังเข้าเงื่อนไข";

type FacebookOutboundRoute =
  | { routeUsed: "MESSENGER_SEND"; targetConversationId?: string | null; channelThreadId: string; pageId: string | null }
  | { routeUsed: "PRIVATE_REPLY"; commentId: string; pageId: string }
  | { routeUsed: "DEFAULT_SEND"; channelThreadId: string };

export class SendOutboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  private parseFacebookProviderError(error: unknown): {
    code: number | null;
    subcode: number | null;
    message: string | null;
    fbtraceId: string | null;
  } {
    const raw = error instanceof Error ? error.message : String(error);
    const jsonStart = raw.indexOf("{");
    if (jsonStart < 0) return { code: null, subcode: null, message: raw, fbtraceId: null };
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
      };
      const providerError = parsed.error;
      return {
        code: typeof providerError?.code === "number" ? providerError.code : null,
        subcode: typeof providerError?.error_subcode === "number" ? providerError.error_subcode : null,
        message: typeof providerError?.message === "string" ? providerError.message : raw,
        fbtraceId: typeof providerError?.fbtrace_id === "string" ? providerError.fbtrace_id : null
      };
    } catch {
      return { code: null, subcode: null, message: raw, fbtraceId: null };
    }
  }

  private isFacebookOutsideWindowError(error: unknown): boolean {
    const parsed = this.parseFacebookProviderError(error);
    if (parsed.code !== 10 || parsed.subcode !== 2018278) return false;
    return (parsed.message ?? "").toLowerCase().includes("outside the allowed window");
  }

  private isEligibleForFacebookPrivateReplyFallback(
    conversation: Conversation | null,
    payload: OutboundMessageRequestedPayload
  ): boolean {
    if (!conversation) return false;
    const outboundType = payload.messageType ?? "TEXT";
    if (outboundType !== "TEXT") return false;
    if (
      payload.mediaUrl ||
      payload.previewUrl ||
      payload.mediaMimeType ||
      payload.fileName ||
      payload.fileSizeBytes ||
      payload.width ||
      payload.height
    ) {
      return false;
    }
    if (conversation.providerThreadType !== "FACEBOOK_COMMENT") return false;
    if (!conversation.providerCommentId?.trim()) return false;
    if (!conversation.providerPageId?.trim()) return false;
    if (conversation.privateReplySentAt) return false;
    const ageMs = Date.now() - conversation.lastMessageAt.getTime();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    return ageMs >= 0 && ageMs <= maxAgeMs;
  }

  private isValidMessengerDmConversationTarget(selected: Conversation, candidate: Conversation): boolean {
    if (candidate.providerThreadType !== "MESSENGER_DM") return false;
    if (
      selected.providerPageId &&
      candidate.providerPageId &&
      selected.providerPageId.trim() &&
      candidate.providerPageId.trim() &&
      selected.providerPageId.trim() !== candidate.providerPageId.trim()
    ) {
      return false;
    }
    if (
      selected.providerExternalUserId &&
      candidate.providerExternalUserId &&
      selected.providerExternalUserId.trim() &&
      candidate.providerExternalUserId.trim() &&
      selected.providerExternalUserId.trim() !== candidate.providerExternalUserId.trim()
    ) {
      return false;
    }
    return isValidFacebookMessengerSendTarget(candidate.channelThreadId, candidate.providerExternalUserId, { allowRawPsid: true });
  }

  private async ensureFacebookCommentAcknowledgement(input: {
    payload: OutboundMessageRequestedPayload;
    conversation: Conversation;
    adapter: ChannelAdapter;
    commentId: string;
  }): Promise<void> {
    if (input.conversation.facebookPublicReplySentAt || !input.adapter.sendPublicCommentReply) return;
    const pageId = (input.conversation.providerPageId ?? "").trim();
    if (!pageId) return;
    try {
      await input.adapter.sendPublicCommentReply({
        pageId,
        commentId: input.commentId,
        text: FACEBOOK_PUBLIC_REPLY_TEXT
      });
      if (this.deps.conversationRepository?.markFacebookPublicReplySent) {
        await this.deps.conversationRepository.markFacebookPublicReplySent(input.payload.conversationId);
      }
      logger.info(
        {
          tenantId: input.payload.tenantId,
          selectedConversationId: input.payload.conversationId,
          providerCommentId: input.commentId,
          providerExternalUserId: input.conversation.providerExternalUserId ?? null,
          providerPageId: input.conversation.providerPageId ?? null
        },
        "Facebook public acknowledgement sent"
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        {
          tenantId: input.payload.tenantId,
          selectedConversationId: input.payload.conversationId,
          providerCommentId: input.commentId,
          providerExternalUserId: input.conversation.providerExternalUserId ?? null,
          providerPageId: input.conversation.providerPageId ?? null,
          error: err.message
        },
        "Facebook public acknowledgement failed; continuing outbound flow"
      );
    }
  }

  private async resolveFacebookOutboundRoute(input: {
    payload: OutboundMessageRequestedPayload;
    conversation: Conversation | null;
    adapter: ChannelAdapter;
  }): Promise<FacebookOutboundRoute> {
    const outboundType = input.payload.messageType ?? "TEXT";
    const selected = input.conversation;
    if (!selected) return { routeUsed: "DEFAULT_SEND", channelThreadId: input.payload.channelThreadId };
    if (selected.providerThreadType === "MESSENGER_DM") {
      if (!isValidFacebookMessengerSendTarget(selected.channelThreadId, selected.providerExternalUserId, { allowRawPsid: true })) {
        throw new Error("Invalid Facebook Messenger send target on selected MESSENGER_DM conversation.");
      }
      return {
        routeUsed: "MESSENGER_SEND",
        channelThreadId: selected.channelThreadId,
        targetConversationId: selected.id,
        pageId: selected.providerPageId?.trim() || null
      };
    }
    if (selected.providerThreadType !== "FACEBOOK_COMMENT") {
      return { routeUsed: "DEFAULT_SEND", channelThreadId: input.payload.channelThreadId };
    }

    const commentId = selected.providerCommentId?.trim() || selected.channelThreadId?.replace(/^comment:/, "").trim() || "";

    if (commentId) {
      await this.ensureFacebookCommentAcknowledgement({
        payload: input.payload,
        conversation: selected,
        adapter: input.adapter,
        commentId
      });
    }

    if (Array.isArray(input.payload.conversationIds) && this.deps.conversationRepository?.findById) {
      for (const conversationId of input.payload.conversationIds) {
        const candidate = await this.deps.conversationRepository.findById(input.payload.tenantId, conversationId);
        if (candidate && this.isValidMessengerDmConversationTarget(selected, candidate)) {
          return {
            routeUsed: "MESSENGER_SEND",
            channelThreadId: candidate.channelThreadId,
            targetConversationId: candidate.id,
            pageId: candidate.providerPageId?.trim() || selected.providerPageId?.trim() || null
          };
        }
      }
    }

    const pageId = selected.providerPageId?.trim();
    const externalUserId = selected.providerExternalUserId?.trim();
    if (pageId && externalUserId && this.deps.conversationRepository?.findFacebookMessengerDmByParticipant) {
      const dmConversation = await this.deps.conversationRepository.findFacebookMessengerDmByParticipant({
        tenantId: input.payload.tenantId,
        providerPageId: pageId,
        providerExternalUserId: externalUserId
      });
      if (dmConversation) {
        if (!this.isValidMessengerDmConversationTarget(selected, dmConversation)) {
          throw new Error("Repository returned invalid Facebook MESSENGER_DM target.");
        }
        return {
          routeUsed: "MESSENGER_SEND",
          channelThreadId: dmConversation.channelThreadId,
          targetConversationId: dmConversation.id,
          pageId: dmConversation.providerPageId?.trim() || selected.providerPageId?.trim() || null
        };
      }
    }

    if (selected.privateReplySentAt) {
      if (!externalUserId) {
        throw new Error("Cannot route Facebook outbound to Messenger: missing provider external user ID.");
      }
      return {
        routeUsed: "MESSENGER_SEND",
        channelThreadId: `user:${externalUserId}`,
        targetConversationId: selected.id,
        pageId: selected.providerPageId?.trim() || null
      };
    }
    if (outboundType !== "TEXT") {
      throw new Error("Facebook comment fallback only supports text-only private reply for first DM opening.");
    }
    if (!commentId) {
      throw new Error("Cannot use Private Reply without provider_comment_id");
    }
    const pageIdForPrivateReply = selected.providerPageId?.trim();
    if (!pageIdForPrivateReply) {
      throw new Error("Cannot use Private Reply without provider_page_id");
    }
    return { routeUsed: "PRIVATE_REPLY", commentId, pageId: pageIdForPrivateReply };
  }

  async execute(payload: OutboundMessageRequestedPayload): Promise<void> {
    const scope = "outbound-message";
    const idempotencyKey = `${payload.tenantId}:${payload.messageId}`;
    const providerRetryKey = payload.messageId; // LINE requires UUID format for X-Line-Retry-Key.
    if (await this.deps.idempotency.hasProcessed(scope, idempotencyKey)) return;

    await this.deps.rateLimiter.checkOrThrow(payload.tenantId, payload.channel);
    const adapter = this.deps.channelAdapterRegistry.get(payload.channel);

    try {
      const conversation = this.deps.conversationRepository?.findById
        ? await this.deps.conversationRepository.findById(payload.tenantId, payload.conversationId)
        : null;
      const route =
        payload.channel === "FACEBOOK"
          ? await this.resolveFacebookOutboundRoute({ payload, conversation, adapter })
          : { routeUsed: "DEFAULT_SEND" as const, channelThreadId: payload.channelThreadId };
      logger.info(
        {
          selectedConversationId: payload.conversationId,
          payloadConversationIds: payload.conversationIds ?? [],
          resolvedTargetConversationId:
            route.routeUsed === "MESSENGER_SEND" ? (route.targetConversationId ?? conversation?.id ?? null) : conversation?.id ?? null,
          routeUsed: route.routeUsed,
          pageId: route.routeUsed === "MESSENGER_SEND" ? route.pageId : conversation?.providerPageId ?? null,
          channelThreadId: route.routeUsed === "PRIVATE_REPLY" ? null : route.channelThreadId,
          providerExternalUserId: conversation?.providerExternalUserId ?? null,
          providerCommentId: conversation?.providerCommentId ?? null
        },
        "Facebook outbound pre-send route selection"
      );
      if (route.routeUsed === "PRIVATE_REPLY") {
        if (!adapter.sendPrivateReply) throw new Error("Facebook Private Reply adapter capability is not available.");
        const providerStartedAt = Date.now();
        const result = await adapter.sendPrivateReply({
          pageId: route.pageId,
          commentId: route.commentId,
          content: payload.content,
          idempotencyKey: providerRetryKey,
          messageType: payload.messageType ?? "TEXT"
        });
        const providerLatencyMs = Date.now() - providerStartedAt;
        this.deps.onProviderLatencyMs?.({
          tenantId: payload.tenantId,
          channel: payload.channel,
          messageId: payload.messageId,
          latencyMs: providerLatencyMs
        });
        if (this.deps.conversationRepository?.markFacebookCommentPrivateReplySent && conversation) {
          const psid = conversation.providerExternalUserId?.trim() || null;
          await this.deps.conversationRepository.markFacebookCommentPrivateReplySent({
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            privateReplyCommentId: route.commentId,
            convertedToDm: Boolean(psid),
            nextChannelThreadId: psid ? `user:${psid}` : null
          });
        }
        await this.deps.messageRepository.markSent(payload.messageId, result.externalMessageId);
        await this.deps.activityLogRepository.create({
          tenantId: payload.tenantId,
          leadId: payload.leadId,
          type: "MESSAGE_SENT",
          metadataJson: {
            externalMessageId: result.externalMessageId,
            channel: payload.channel,
            messageType: payload.messageType ?? "TEXT",
            routeUsed: "PRIVATE_REPLY",
            providerCommentId: route.commentId,
            providerExternalUserId: conversation?.providerExternalUserId ?? null,
            providerPageId: conversation?.providerPageId ?? null,
            selectedConversationId: payload.conversationId,
            resolvedTargetConversationId: conversation?.id ?? null
          }
        });
        logger.info(
          {
            tenantId: payload.tenantId,
            selectedConversationId: payload.conversationId,
            resolvedTargetConversationId: conversation?.id ?? null,
            routeUsed: "PRIVATE_REPLY",
            providerCommentId: route.commentId,
            providerExternalUserId: conversation?.providerExternalUserId ?? null,
            providerPageId: conversation?.providerPageId ?? null
          },
          "Facebook outbound route resolved"
        );
        await this.deps.idempotency.markProcessed(scope, idempotencyKey);
        return;
      }

      const providerStartedAt = Date.now();
      let effectiveRouteUsed: "MESSENGER_SEND" | "PRIVATE_REPLY" | null = route.routeUsed === "MESSENGER_SEND" ? "MESSENGER_SEND" : null;
      let fallbackRouteUsed: "PRIVATE_REPLY" | null = null;
      let result: { externalMessageId: string };
      try {
        result = await adapter.sendMessage({
          pageId: route.routeUsed === "MESSENGER_SEND" ? route.pageId : null,
          channelThreadId: route.channelThreadId,
          content: payload.content,
          idempotencyKey: providerRetryKey,
          messageType: payload.messageType ?? "TEXT",
          mediaUrl: payload.mediaUrl,
          previewUrl: payload.previewUrl,
          mediaMimeType: payload.mediaMimeType,
          fileName: payload.fileName,
          fileSizeBytes: payload.fileSizeBytes,
          width: payload.width,
          height: payload.height
        });
      } catch (sendError) {
        const outsideWindow = payload.channel === "FACEBOOK" && this.isFacebookOutsideWindowError(sendError);
        const canFallback =
          outsideWindow &&
          route.routeUsed === "MESSENGER_SEND" &&
          this.isEligibleForFacebookPrivateReplyFallback(conversation, payload) &&
          Boolean(adapter.sendPrivateReply);
        if (!canFallback) throw sendError;

        const parsed = this.parseFacebookProviderError(sendError);
        logger.warn(
          {
            tenantId: payload.tenantId,
            selectedConversationId: payload.conversationId,
            originalRouteUsed: "MESSENGER_SEND",
            fallbackRouteUsed: "PRIVATE_REPLY",
            metaErrorCode: parsed.code,
            metaErrorSubcode: parsed.subcode,
            providerCommentId: conversation?.providerCommentId ?? null,
            providerPageId: conversation?.providerPageId ?? null,
            providerExternalUserId: conversation?.providerExternalUserId ?? null
          },
          "Facebook outbound outside-window fallback to private reply"
        );

        result = await adapter.sendPrivateReply!({
          pageId: conversation!.providerPageId!,
          commentId: conversation!.providerCommentId!,
          content: payload.content,
          idempotencyKey: providerRetryKey,
          messageType: "TEXT"
        });
        fallbackRouteUsed = "PRIVATE_REPLY";
        effectiveRouteUsed = "PRIVATE_REPLY";
        if (this.deps.conversationRepository?.markFacebookCommentPrivateReplySent && conversation) {
          await this.deps.conversationRepository.markFacebookCommentPrivateReplySent({
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            privateReplyCommentId: conversation.providerCommentId!,
            convertedToDm: false,
            nextChannelThreadId: null
          });
        }
      }
      const providerLatencyMs = Date.now() - providerStartedAt;
      this.deps.onProviderLatencyMs?.({
        tenantId: payload.tenantId,
        channel: payload.channel,
        messageId: payload.messageId,
        latencyMs: providerLatencyMs
      });

      await this.deps.messageRepository.markSent(payload.messageId, result.externalMessageId);
      await this.deps.activityLogRepository.create({
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        type: "MESSAGE_SENT",
        metadataJson: {
          externalMessageId: result.externalMessageId,
          channel: payload.channel,
          messageType: payload.messageType ?? "TEXT",
          routeUsed: effectiveRouteUsed,
          fallbackRouteUsed,
          providerCommentId: conversation?.providerCommentId ?? null,
          providerExternalUserId: conversation?.providerExternalUserId ?? null,
          providerPageId: conversation?.providerPageId ?? null,
          selectedConversationId: payload.conversationId,
          resolvedTargetConversationId:
            route.routeUsed === "MESSENGER_SEND" ? (route.targetConversationId ?? conversation?.id ?? null) : conversation?.id ?? null,
          mediaMimeType: payload.mediaMimeType ?? null,
          mediaUrl: payload.mediaUrl ?? null,
          previewUrl: payload.previewUrl ?? payload.mediaUrl ?? null,
          fileName: payload.fileName ?? null
        }
      });
      await this.deps.idempotency.markProcessed(scope, idempotencyKey);
      logger.info(
        {
          tenantId: payload.tenantId,
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          channel: payload.channel,
          routeUsed: effectiveRouteUsed,
          fallbackRouteUsed,
          providerCommentId: conversation?.providerCommentId ?? null,
          providerExternalUserId: conversation?.providerExternalUserId ?? null,
          providerPageId: conversation?.providerPageId ?? null,
          selectedConversationId: payload.conversationId,
          resolvedTargetConversationId:
            route.routeUsed === "MESSENGER_SEND" ? (route.targetConversationId ?? conversation?.id ?? null) : conversation?.id ?? null,
          providerLatencyMs
        },
        "Outbound send completed"
      );
    } catch (error) {
      let storedError = String(error);
      if (payload.channel === "FACEBOOK" && this.isFacebookOutsideWindowError(error)) {
        const parsed = this.parseFacebookProviderError(error);
        storedError = `Facebook Send API outside-window (${parsed.code ?? "unknown"}/${parsed.subcode ?? "unknown"}): ${
          parsed.message ?? "outside the allowed window"
        } | ${FACEBOOK_OUTSIDE_WINDOW_USER_MESSAGE}`;
      }
      await this.deps.messageRepository.markFailed(payload.messageId, storedError);
      logger.error(
        {
          tenantId: payload.tenantId,
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          channel: payload.channel,
          err: error instanceof Error ? { name: error.name, message: error.message } : String(error)
        },
        "Outbound send failed"
      );
      throw error;
    }
  }
}
