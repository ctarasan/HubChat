import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import type {
  ActivityLogRepository,
  ChannelAccountRepository,
  ConversationRepository,
  ContactRepository,
  LeadRepository,
  MessageRepository
} from "../../domain/ports.js";

interface Dependencies {
  leadRepository: LeadRepository;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  contactRepository?: ContactRepository;
  channelAccountRepository?: ChannelAccountRepository;
}

export class ProcessInboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  private sanitizeDisplayName(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private sanitizeProfileImageUrl(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async execute(payload: InboundMessageNormalizedPayload): Promise<void> {
    if (!payload?.tenantId || !payload.channel || !payload.externalUserId) {
      throw new Error("Invalid inbound payload: missing tenantId, channel, or externalUserId");
    }

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

    const occurredAtDate = new Date(occurredAt ?? "");
    const safeOccurredAt = Number.isNaN(occurredAtDate.getTime()) ? new Date() : occurredAtDate;
    const contact = this.deps.contactRepository
      ? await this.deps.contactRepository.getOrCreateByIdentity({
          tenantId,
          channel,
          externalUserId,
          profile
        })
      : null;
    const incomingDisplayName = this.sanitizeDisplayName(payload.senderDisplayName ?? profile?.name);
    const incomingProfileImageUrl = this.sanitizeProfileImageUrl(
      payload.senderProfileImageUrl ?? profile?.profileImageUrl ?? profile?.avatarUrl
    );
    const identityProfile = this.deps.contactRepository
      ? await this.deps.contactRepository.upsertIdentityProfile({
          tenantId,
          channel,
          externalUserId,
          displayName: incomingDisplayName,
          profileImageUrl: incomingProfileImageUrl,
          profile
        })
      : {
          contactId: contact?.id ?? null,
          displayName: incomingDisplayName,
          profileImageUrl: incomingProfileImageUrl
        };
    const resolvedDisplayName = this.sanitizeDisplayName(identityProfile.displayName ?? contact?.displayName ?? incomingDisplayName);
    const resolvedProfileImageUrl = this.sanitizeProfileImageUrl(
      identityProfile.profileImageUrl ?? contact?.profileImageUrl ?? incomingProfileImageUrl
    );
    const channelAccount = this.deps.channelAccountRepository
      ? await this.deps.channelAccountRepository.findByTenantAndChannel(tenantId, channel)
      : null;

    let lead = await this.deps.leadRepository.findByExternalUser(tenantId, channel, externalUserId);
    if (!lead) {
      lead = await this.deps.leadRepository.create({
        tenantId,
        sourceChannel: channel,
        externalUserId,
          name: resolvedDisplayName ?? profile?.name ?? null,
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
        contactId: identityProfile.contactId ?? contact?.id ?? null,
        channelAccountId: channelAccount?.id ?? null,
        channelType: channel,
        channelThreadId,
        participantDisplayName: resolvedDisplayName,
        participantProfileImageUrl: resolvedProfileImageUrl,
        status: "OPEN",
        lastMessageAt: safeOccurredAt
      });
    } else {
      await this.deps.conversationRepository.touchLastMessage(
        conversation.id,
        safeOccurredAt,
        resolvedDisplayName,
        incomingProfileImageUrl ?? undefined
      );
    }

    await this.deps.messageRepository.create({
      tenantId,
      conversationId: conversation.id,
      channelType: channel,
      externalMessageId,
      messageType: "TEXT",
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
