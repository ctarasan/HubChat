import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import type {
  ActivityLogRepository,
  ConversationRepository,
  LeadRepository,
  MessageRepository
} from "../../domain/ports.js";

interface Dependencies {
  leadRepository: LeadRepository;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
}

export class ProcessInboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  async execute(payload: InboundMessageNormalizedPayload): Promise<void> {
    const {
      tenantId,
      channel,
      externalUserId,
      channelThreadId,
      text,
      externalMessageId,
      occurredAt,
      profile
    } = payload;

    const occurredAtDate = new Date(occurredAt);
    const safeOccurredAt = Number.isNaN(occurredAtDate.getTime()) ? new Date() : occurredAtDate;

    let lead = await this.deps.leadRepository.findByExternalUser(tenantId, channel, externalUserId);
    if (!lead) {
      lead = await this.deps.leadRepository.create({
        tenantId,
        sourceChannel: channel,
        externalUserId,
        name: profile?.name ?? null,
        phone: profile?.phone ?? null,
        email: profile?.email ?? null,
        status: "NEW",
        assignedSalesId: null,
        lastContactAt: safeOccurredAt,
        leadScore: null,
        tags: []
      });
    }

    let conversation = await this.deps.conversationRepository.findByThread(tenantId, channel, channelThreadId);
    if (!conversation) {
      conversation = await this.deps.conversationRepository.create({
        tenantId,
        leadId: lead.id,
        channelType: channel,
        channelThreadId,
        status: "OPEN",
        lastMessageAt: safeOccurredAt
      });
    } else {
      await this.deps.conversationRepository.touchLastMessage(conversation.id, safeOccurredAt);
    }

    await this.deps.messageRepository.create({
      tenantId,
      conversationId: conversation.id,
      channelType: channel,
      externalMessageId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: text
    });

    await this.deps.activityLogRepository.create({
      tenantId,
      leadId: lead.id,
      type: "MESSAGE_RECEIVED",
      metadataJson: { channel, externalMessageId, channelThreadId }
    });
  }
}
