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
import type { ChannelType } from "../../domain/entities.js";

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
const FACEBOOK_PUBLIC_REPLY_TEXT = "ขออนุญาตตอบกลับทาง Inbox นะครับ";

function sanitizeProviderErrorForLog(input: string): string {
  // Prevent accidental token leakage if provider error includes full request URLs.
  return input.replace(/access_token=[^&\s"]+/gi, "access_token=[REDACTED]");
}

export class SendOutboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

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
      const shouldUseFacebookPrivateReply =
        payload.channel === "FACEBOOK" &&
        conversation?.providerThreadType === "FACEBOOK_COMMENT" &&
        !conversation?.privateReplySentAt;

      if (shouldUseFacebookPrivateReply) {
        const outboundType = payload.messageType ?? "TEXT";
        if (outboundType !== "TEXT") {
          throw new Error("First Facebook comment reply must be text only.");
        }
        const commentId = conversation.providerCommentId?.trim() || conversation.channelThreadId?.replace(/^comment:/, "").trim();
        if (!commentId) {
          throw new Error("Cannot send private reply: missing Facebook comment ID.");
        }
        if (!adapter.sendPrivateReply) {
          throw new Error("Private reply failed. Please try again.");
        }
        const providerStartedAt = Date.now();
        let result: { externalMessageId: string };
        try {
          result = await adapter.sendPrivateReply({
            pageId: conversation.providerPageId ?? null,
            commentId,
            content: payload.content,
            idempotencyKey: providerRetryKey,
            messageType: outboundType
          });
        } catch (error) {
          const msg = sanitizeProviderErrorForLog(String(error));
          logger.warn(
            {
              tenantId: payload.tenantId,
              conversationId: payload.conversationId,
              messageId: payload.messageId,
              channel: payload.channel,
              providerThreadType: conversation.providerThreadType,
              providerCommentIdPresent: Boolean(commentId),
              providerPageIdPresent: Boolean(conversation.providerPageId?.trim()),
              privateReplyError: msg
            },
            "Facebook private reply provider call failed"
          );
          if (msg.includes("missing Facebook comment ID")) throw error;
          if (msg.includes("text only")) throw error;
          throw new Error("Private reply failed. Please try again.");
        }
        const providerLatencyMs = Date.now() - providerStartedAt;
        this.deps.onProviderLatencyMs?.({
          tenantId: payload.tenantId,
          channel: payload.channel,
          messageId: payload.messageId,
          latencyMs: providerLatencyMs
        });
        const shouldSendFacebookPublicReply = !conversation.facebookPublicReplySentAt;
        if (shouldSendFacebookPublicReply && adapter.sendPublicCommentReply) {
          try {
            const pageId = (conversation.providerPageId ?? "").trim();
            await adapter.sendPublicCommentReply({
              pageId,
              commentId,
              text: FACEBOOK_PUBLIC_REPLY_TEXT
            });
            if (this.deps.conversationRepository?.markFacebookPublicReplySent) {
              await this.deps.conversationRepository.markFacebookPublicReplySent(payload.conversationId);
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn(
              {
                tenantId: payload.tenantId,
                conversationId: payload.conversationId,
                messageId: payload.messageId,
                channel: payload.channel,
                error: err.message,
                stack: err.stack
              },
              "Facebook public comment reply failed; continuing private reply flow"
            );
          }
        }
        if (this.deps.conversationRepository?.markFacebookCommentPrivateReplySent) {
          const psid = conversation.providerExternalUserId?.trim() || null;
          await this.deps.conversationRepository.markFacebookCommentPrivateReplySent({
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            privateReplyCommentId: commentId,
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
            messageType: outboundType,
            transport: "FACEBOOK_PRIVATE_REPLY",
            privateReplyCommentId: commentId
          }
        });
        await this.deps.idempotency.markProcessed(scope, idempotencyKey);
        return;
      }

      const providerStartedAt = Date.now();
      const result = await adapter.sendMessage({
        channelThreadId: payload.channelThreadId,
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
