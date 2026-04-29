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

type FacebookOutboundRoute =
  | { routeUsed: "MESSENGER_SEND"; targetConversationId?: string | null; channelThreadId: string }
  | { routeUsed: "PRIVATE_REPLY"; commentId: string }
  | { routeUsed: "DEFAULT_SEND"; channelThreadId: string };

export class SendOutboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  private async ensureFacebookCommentAcknowledgement(input: {
    payload: OutboundMessageRequestedPayload;
    conversation: Conversation;
    adapter: ChannelAdapter;
    commentId: string;
  }): Promise<void> {
    if (input.conversation.facebookPublicReplySentAt || !input.adapter.sendPublicCommentReply) return;
    try {
      await input.adapter.sendPublicCommentReply({
        pageId: (input.conversation.providerPageId ?? "").trim(),
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
      return { routeUsed: "MESSENGER_SEND", channelThreadId: selected.channelThreadId, targetConversationId: selected.id };
    }
    if (selected.providerThreadType !== "FACEBOOK_COMMENT") {
      return { routeUsed: "DEFAULT_SEND", channelThreadId: input.payload.channelThreadId };
    }

    const commentId = selected.providerCommentId?.trim() || selected.channelThreadId?.replace(/^comment:/, "").trim();
    if (!commentId) throw new Error("Cannot send private reply: missing Facebook comment ID.");

    await this.ensureFacebookCommentAcknowledgement({
      payload: input.payload,
      conversation: selected,
      adapter: input.adapter,
      commentId
    });

    const pageId = selected.providerPageId?.trim();
    const externalUserId = selected.providerExternalUserId?.trim();
    if (pageId && externalUserId && this.deps.conversationRepository?.findFacebookMessengerDmByParticipant) {
      const dmConversation = await this.deps.conversationRepository.findFacebookMessengerDmByParticipant({
        tenantId: input.payload.tenantId,
        providerPageId: pageId,
        providerExternalUserId: externalUserId
      });
      if (dmConversation) {
        return {
          routeUsed: "MESSENGER_SEND",
          channelThreadId: dmConversation.channelThreadId,
          targetConversationId: dmConversation.id
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
        targetConversationId: selected.id
      };
    }
    if (outboundType !== "TEXT") {
      throw new Error("Facebook comment fallback only supports text-only private reply for first DM opening.");
    }
    return { routeUsed: "PRIVATE_REPLY", commentId };
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
      if (route.routeUsed === "PRIVATE_REPLY") {
        if (!adapter.sendPrivateReply) throw new Error("Facebook Private Reply adapter capability is not available.");
        const providerStartedAt = Date.now();
        const result = await adapter.sendPrivateReply({
          pageId: conversation?.providerPageId ?? null,
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
      const result = await adapter.sendMessage({
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
          routeUsed: route.routeUsed === "MESSENGER_SEND" ? "MESSENGER_SEND" : null,
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
          routeUsed: route.routeUsed === "MESSENGER_SEND" ? "MESSENGER_SEND" : null,
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
      await this.deps.messageRepository.markFailed(payload.messageId, String(error));
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
