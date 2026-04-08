import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import type {
  ActivityLogRepository,
  ChannelAdapter,
  IdempotencyPort,
  MessageRepository,
  RateLimiterPort
} from "../../domain/ports.js";

interface Dependencies {
  channelAdapter: ChannelAdapter;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  rateLimiter: RateLimiterPort;
  idempotency: IdempotencyPort;
}

export class SendOutboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  async execute(payload: OutboundMessageRequestedPayload): Promise<void> {
    const scope = "outbound-message";
    const key = `${payload.tenantId}:${payload.messageId}`;
    if (await this.deps.idempotency.hasProcessed(scope, key)) return;

    await this.deps.rateLimiter.checkOrThrow(payload.tenantId, payload.channel);

    try {
      const result = await this.deps.channelAdapter.sendMessage({
        channelThreadId: payload.channelThreadId,
        content: payload.content,
        idempotencyKey: key
      });

      await this.deps.messageRepository.markSent(payload.messageId);
      await this.deps.activityLogRepository.create({
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        type: "MESSAGE_SENT",
        metadataJson: { externalMessageId: result.externalMessageId, channel: payload.channel }
      });
      await this.deps.idempotency.markProcessed(scope, key);
    } catch (error) {
      await this.deps.messageRepository.markFailed(payload.messageId, String(error));
      throw error;
    }
  }
}
