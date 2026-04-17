import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
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
      const result = await adapter.sendMessage({
        channelThreadId: payload.channelThreadId,
        content: payload.content,
        idempotencyKey: providerRetryKey
      });

      await this.deps.messageRepository.markSent(payload.messageId, result.externalMessageId);
      await this.deps.activityLogRepository.create({
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        type: "MESSAGE_SENT",
        metadataJson: { externalMessageId: result.externalMessageId, channel: payload.channel }
      });
      await this.deps.idempotency.markProcessed(scope, idempotencyKey);
    } catch (error) {
      await this.deps.messageRepository.markFailed(payload.messageId, String(error));
      throw error;
    }
  }
}
