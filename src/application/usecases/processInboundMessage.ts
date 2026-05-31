import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import { buildLastMessagePreview } from "../conversationPreview.js";
import pino from "pino";
import { parseMetaTimestamp } from "../../domain/dateUtils.js";
import { normalizeFacebookMessengerThreadTarget } from "../../domain/facebookThreadTargets.js";
import { shouldReopenConversationOnCustomerReply } from "../../domain/leadInboxWorkflow.js";
import { computeSlaDueAtFromPolicy } from "../../domain/tenantSlaPolicy.js";
import type {
  ActivityLogRepository,
  ChannelAccountRepository,
  ConversationRepository,
  ContactRepository,
  LeadRepository,
  MessageRepository,
  MarketingEventRepository
} from "../../domain/ports.js";
import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";
import { loadEffectiveTenantSlaPolicy } from "../sla/loadEffectiveTenantSlaPolicy.js";
import { recordMarketingEventSafe } from "../marketing/recordMarketingEvent.js";

interface Dependencies {
  leadRepository: LeadRepository;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  contactRepository?: ContactRepository;
  channelAccountRepository?: ChannelAccountRepository;
  marketingEventRepository?: MarketingEventRepository;
  slaPolicyRepository?: Pick<SlaPolicyRepository, "findByTenantId">;
  inboundMediaService?: {
    processLineImage(input: {
      tenantId: string;
      lineMessageId: string;
    }): Promise<{
      mediaUrl: string;
      previewUrl: string;
      metadata?: Record<string, unknown>;
    }>;
  };
}

const logger = pino({ name: "process-inbound-message-usecase" });

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
      messageType,
      mediaUrl,
      previewUrl,
      lineMessageId,
      metadataJson,
      profile,
      sourceThreadType,
      facebookPageId,
      facebookPostId,
      facebookCommentId
    } = payload;
    const normalizedMessageType = String(messageType ?? "TEXT").toUpperCase() === "IMAGE" ? "IMAGE" : "TEXT";
    const instagramRecipientId =
      channel === "INSTAGRAM" && typeof metadataJson?.instagramRecipientId === "string" && metadataJson.instagramRecipientId.trim()
        ? metadataJson.instagramRecipientId.trim()
        : null;
    logger.info(
      {
        tenantId,
        externalMessageId,
        channel,
        channelThreadId,
        normalizedMessageType
      },
      "Inbound message processing started"
    );

    const parsedOccurredAt = new Date(parseMetaTimestamp(occurredAt));
    const queueCreatedAtCandidate = payload.queueCreatedAt ? new Date(parseMetaTimestamp(payload.queueCreatedAt)) : null;
    let safeOccurredAt = Number.isNaN(parsedOccurredAt.getTime()) ? new Date() : parsedOccurredAt;
    if (channel === "FACEBOOK" && safeOccurredAt.getUTCFullYear() < 2000) {
      const fallbackDate =
        queueCreatedAtCandidate && !Number.isNaN(queueCreatedAtCandidate.getTime()) ? queueCreatedAtCandidate : new Date();
      logger.warn(
        {
          tenantId,
          externalMessageId,
          facebookCommentId: facebookCommentId ?? null,
          sourceThreadType: sourceThreadType ?? null,
          rawTimestamp: occurredAt ?? null,
          queueCreatedAt: payload.queueCreatedAt ?? null,
          fallbackOccurredAt: fallbackDate.toISOString()
        },
        "Facebook inbound occurredAt is suspiciously old; falling back to queueCreatedAt/now"
      );
      safeOccurredAt = fallbackDate;
    }
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
    const leadCreated = !lead;
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
      await recordMarketingEventSafe(this.deps.marketingEventRepository, {
        tenantId,
        leadId: lead.id,
        eventType: "LEAD_CREATED",
        occurredAt: safeOccurredAt,
        actorType: "CUSTOMER",
        channel,
        metadata: { sourceChannel: channel }
      });
    }

    let resolvedMediaUrl: string | null = null;
    let resolvedPreviewUrl: string | null = null;
    let inboundMetadataJson: Record<string, unknown> = {};
    let effectiveContent = text;
    if (normalizedMessageType === "IMAGE") {
      effectiveContent = "[image]";
      if (channel === "FACEBOOK" || channel === "INSTAGRAM") {
        const httpsMedia = typeof mediaUrl === "string" && mediaUrl.trim().startsWith("https://") ? mediaUrl.trim() : null;
        resolvedMediaUrl = httpsMedia;
        resolvedPreviewUrl = typeof previewUrl === "string" && previewUrl.trim().startsWith("https://") ? previewUrl.trim() : httpsMedia;
        inboundMetadataJson = {
          source: channel === "FACEBOOK" ? "facebook" : "instagram",
          mediaUrl: resolvedMediaUrl,
          previewUrl: resolvedPreviewUrl
        };
      } else if (channel === "LINE") {
        const payloadLineMessageId =
          typeof metadataJson?.lineMessageId === "string" && metadataJson.lineMessageId.trim()
            ? metadataJson.lineMessageId.trim()
            : null;
        const msgId = payloadLineMessageId ?? (typeof lineMessageId === "string" && lineMessageId.trim() ? lineMessageId.trim() : null);
        if (!msgId) {
          logger.warn(
            {
              tenantId,
              channelThreadId,
              externalMessageId
            },
            "LINE image missing lineMessageId"
          );
        }
        if (msgId && this.deps.inboundMediaService) {
          try {
            logger.info(
              {
                tenantId,
                lineMessageId: msgId,
                externalMessageId,
                processLineImageCalled: true
              },
              "Calling inboundMediaService.processLineImage"
            );
            const processed = await this.deps.inboundMediaService.processLineImage({
              tenantId,
              lineMessageId: msgId
            });
            logger.info(
              {
                tenantId,
                lineMessageId: msgId,
                externalMessageId,
                processLineImageCalled: true,
                processLineImageSuccess: true,
                mediaUrl: processed.mediaUrl,
                previewUrl: processed.previewUrl
              },
              "inboundMediaService.processLineImage succeeded"
            );
            resolvedMediaUrl = processed.mediaUrl;
            resolvedPreviewUrl = processed.previewUrl;
            inboundMetadataJson = {
              source: "line",
              lineMessageId: msgId,
              ...(processed.metadata ?? {}),
              mediaUrl: resolvedMediaUrl,
              previewUrl: resolvedPreviewUrl
            };
          } catch (error) {
            logger.warn(
              {
                tenantId,
                lineMessageId: msgId,
                externalMessageId,
                error: String(error)
              },
              "LINE inbound image media processing failed"
            );
            inboundMetadataJson = {
              source: "line",
              lineMessageId: msgId,
              error: true,
              errorReason: String(error)
            };
          }
        } else {
          inboundMetadataJson = {
            source: "line",
            lineMessageId: msgId,
            error: true,
            errorReason: "LINE image processing unavailable"
          };
        }
      }
    }

    const inboundPreview = buildLastMessagePreview({
      messageType: normalizedMessageType,
      content: normalizedMessageType === "IMAGE" ? "[Image]" : effectiveContent
    });
    const resolvedChannelThreadId =
      channel === "FACEBOOK" && sourceThreadType === "MESSENGER_DM"
        ? (normalizeFacebookMessengerThreadTarget(channelThreadId, externalUserId) ?? channelThreadId)
        : channelThreadId;

    let conversation = await this.deps.conversationRepository.findByThread(tenantId, channel, resolvedChannelThreadId);
    const conversationCreated = !conversation;
    const tenantSlaPolicy = await loadEffectiveTenantSlaPolicy(tenantId, this.deps.slaPolicyRepository);
    let slaDueAtForEvent: Date | null = null;
    if (!conversation) {
      const initialSla = computeSlaDueAtFromPolicy(safeOccurredAt, {
        policy: tenantSlaPolicy,
        conversationStatus: "OPEN",
        firstResponseAt: null,
        reopenFromResolved: false
      });
      slaDueAtForEvent = initialSla ?? null;
      conversation = await this.deps.conversationRepository.create({
        tenantId,
        leadId: lead.id,
        contactId: identityProfile.contactId ?? contact?.id ?? null,
        channelAccountId: channelAccount?.id ?? null,
        channelType: channel,
        channelThreadId: resolvedChannelThreadId,
        providerThreadType: sourceThreadType ?? null,
        providerCommentId: channel === "FACEBOOK" ? (facebookCommentId ?? null) : null,
        providerPostId: channel === "FACEBOOK" ? (facebookPostId ?? null) : null,
        providerPageId: channel === "FACEBOOK" ? (facebookPageId ?? null) : null,
        providerExternalUserId: channel === "FACEBOOK" || channel === "INSTAGRAM" ? externalUserId : null,
        privateReplySentAt: null,
        privateReplyCommentId: null,
        convertedToDmAt: null,
        participantDisplayName: resolvedDisplayName,
        participantProfileImageUrl: resolvedProfileImageUrl,
        unreadCount: 1,
        lastReadAt: null,
        lastMessagePreview: inboundPreview.preview,
        lastMessageType: inboundPreview.type,
        status: "OPEN",
        lastMessageAt: safeOccurredAt,
        lastCustomerMessageAt: safeOccurredAt,
        slaDueAt: initialSla ?? undefined
      });
      await recordMarketingEventSafe(this.deps.marketingEventRepository, {
        tenantId,
        leadId: lead.id,
        conversationId: conversation.id,
        channel,
        eventType: "CONVERSATION_CREATED",
        occurredAt: safeOccurredAt,
        actorType: "CUSTOMER",
        metadata: {}
      });
      if (slaDueAtForEvent) {
        await recordMarketingEventSafe(this.deps.marketingEventRepository, {
          tenantId,
          leadId: lead.id,
          conversationId: conversation.id,
          channel,
          eventType: "SLA_DUE_SET",
          occurredAt: safeOccurredAt,
          actorType: "SYSTEM",
          metadata: { slaDueAt: slaDueAtForEvent.toISOString() }
        });
      }
    } else {
      const reopenFromResolved = shouldReopenConversationOnCustomerReply(conversation.status);
      const slaDueAt = computeSlaDueAtFromPolicy(safeOccurredAt, {
        policy: tenantSlaPolicy,
        conversationStatus: conversation.status,
        firstResponseAt: conversation.firstResponseAt ?? null,
        reopenFromResolved
      });
      if (slaDueAt) slaDueAtForEvent = slaDueAt;
      await this.deps.conversationRepository.touchLastMessage(
        conversation.id,
        safeOccurredAt,
        {
          participantDisplayName: resolvedDisplayName,
          participantProfileImageUrl: incomingProfileImageUrl ?? undefined,
          incrementUnreadCount: true,
          lastMessagePreview: inboundPreview.preview,
          lastMessageType: inboundPreview.type,
          lastCustomerMessageAt: safeOccurredAt,
          slaDueAt: slaDueAt ?? undefined,
          reopenFromResolved
        }
      );
      if (reopenFromResolved) {
        conversation = { ...conversation, status: "OPEN", resolvedAt: null };
      }
      if (slaDueAtForEvent) {
        await recordMarketingEventSafe(this.deps.marketingEventRepository, {
          tenantId,
          leadId: lead.id,
          conversationId: conversation.id,
          channel,
          eventType: "SLA_DUE_SET",
          occurredAt: safeOccurredAt,
          actorType: "SYSTEM",
          metadata: { slaDueAt: slaDueAtForEvent.toISOString() }
        });
      }
    }

    if (normalizedMessageType === "IMAGE" && channel === "LINE") {
      logger.info(
        {
          tenantId,
          externalMessageId,
          channel,
          lineMessageId:
            typeof (inboundMetadataJson.lineMessageId as string | undefined) === "string"
              ? (inboundMetadataJson.lineMessageId as string)
              : null,
          mediaUrl: resolvedMediaUrl,
          previewUrl: resolvedPreviewUrl,
          metadataJson: inboundMetadataJson
        },
        "LINE image payload before messageRepository.create"
      );
    }

    await this.deps.messageRepository.create({
      tenantId,
      conversationId: conversation.id,
      channelType: channel,
      externalMessageId,
      messageType: normalizedMessageType,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: effectiveContent,
      occurredAt: safeOccurredAt,
      mediaUrl: resolvedMediaUrl,
      previewUrl: resolvedPreviewUrl,
      metadataJson:
        normalizedMessageType === "IMAGE"
          ? {
              ...inboundMetadataJson,
              ...(channel === "INSTAGRAM" && instagramRecipientId ? { instagramRecipientId } : {}),
              mediaUrl: resolvedMediaUrl ?? (inboundMetadataJson.mediaUrl as string | undefined) ?? null,
              previewUrl: resolvedPreviewUrl ?? (inboundMetadataJson.previewUrl as string | undefined) ?? null
            }
          : channel === "INSTAGRAM" && instagramRecipientId
            ? { instagramRecipientId }
            : {}
    });
    logger.info(
      {
        tenantId,
        channel,
        leadId: lead.id,
        conversationId: conversation.id,
        externalMessageId,
        channelThreadId: resolvedChannelThreadId,
        messageType: normalizedMessageType,
        finalMetadata: normalizedMessageType === "IMAGE" ? inboundMetadataJson : {}
      },
      "Inbound message persisted"
    );

    await this.deps.activityLogRepository.create({
      tenantId,
      leadId: lead.id,
      type: "MESSAGE_RECEIVED",
      metadataJson: { channel, externalMessageId, channelThreadId: resolvedChannelThreadId }
    });

    await recordMarketingEventSafe(this.deps.marketingEventRepository, {
      tenantId,
      leadId: lead.id,
      conversationId: conversation.id,
      channel,
      eventType: "CUSTOMER_MESSAGE_RECEIVED",
      occurredAt: safeOccurredAt,
      actorType: "CUSTOMER",
      metadata: {
        messageType: normalizedMessageType,
        externalMessageId,
        conversationCreated,
        leadCreated
      }
    });
  }
}
