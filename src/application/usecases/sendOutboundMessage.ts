import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import pino from "pino";
import type {
  ActivityLogRepository,
  ChannelAdapter,
  IdempotencyPort,
  MessageRepository,
  RateLimiterPort
} from "../../domain/ports.js";
import type { ChannelType } from "../../domain/entities.js";

interface Dependencies {
  channelAdapterRegistry: {
    get: (channel: ChannelType) => ChannelAdapter;
  };
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  rateLimiter: RateLimiterPort;
  idempotency: IdempotencyPort;
  onProviderLatencyMs?: (input: { tenantId: string; channel: ChannelType; messageId: string; latencyMs: number }) => void;
}

const logger = pino({ name: "send-outbound-usecase" });

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
      const providerStartedAt = Date.now();
      const result = await adapter.sendMessage({
        channelThreadId: payload.channelThreadId,
        content: payload.content,
        idempotencyKey: providerRetryKey,
        messageType: payload.messageType ?? "TEXT",
        mediaUrl: payload.mediaUrl,
        previewUrl: payload.previewUrl,
        mediaMimeType: payload.mediaMimeType,
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
          previewUrl: payload.previewUrl ?? payload.mediaUrl ?? null
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
