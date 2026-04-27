import type { InboundMessageNormalizedPayload } from "../../domain/events.js";
import { buildLastMessagePreview } from "../conversationPreview.js";
import pino from "pino";
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
  inboundMediaService?: {
    processLineImage(input: {
      tenantId: string;
      lineMessageId: string;
    }): Promise<{ mediaUrl: string; previewUrl: string }>;
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

    let resolvedMediaUrl: string | null = null;
    let resolvedPreviewUrl: string | null = null;
    let inboundMetadataJson: Record<string, unknown> = {};
    let effectiveContent = text;
    if (normalizedMessageType === "IMAGE") {
      effectiveContent = "";
      if (channel === "FACEBOOK") {
        const httpsMedia = typeof mediaUrl === "string" && mediaUrl.trim().startsWith("https://") ? mediaUrl.trim() : null;
        resolvedMediaUrl = httpsMedia;
        resolvedPreviewUrl = typeof previewUrl === "string" && previewUrl.trim().startsWith("https://") ? previewUrl.trim() : httpsMedia;
        inboundMetadataJson = {
          source: "facebook",
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
    let conversation = await this.deps.conversationRepository.findByThread(tenantId, channel, channelThreadId);
    if (!conversation) {
      conversation = await this.deps.conversationRepository.create({
        tenantId,
        leadId: lead.id,
        contactId: identityProfile.contactId ?? contact?.id ?? null,
        channelAccountId: channelAccount?.id ?? null,
        channelType: channel,
        channelThreadId,
        providerThreadType: sourceThreadType ?? null,
        providerCommentId: channel === "FACEBOOK" ? (facebookCommentId ?? null) : null,
        providerPostId: channel === "FACEBOOK" ? (facebookPostId ?? null) : null,
        providerPageId: channel === "FACEBOOK" ? (facebookPageId ?? null) : null,
        providerExternalUserId: channel === "FACEBOOK" ? externalUserId : null,
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
        lastMessageAt: safeOccurredAt
      });
    } else {
      await this.deps.conversationRepository.touchLastMessage(
        conversation.id,
        safeOccurredAt,
        {
          participantDisplayName: resolvedDisplayName,
          participantProfileImageUrl: incomingProfileImageUrl ?? undefined,
          incrementUnreadCount: true,
          lastMessagePreview: inboundPreview.preview,
          lastMessageType: inboundPreview.type
        }
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
      mediaUrl: resolvedMediaUrl,
      previewUrl: resolvedPreviewUrl,
      metadataJson:
        normalizedMessageType === "IMAGE"
          ? {
              ...inboundMetadataJson,
              mediaUrl: resolvedMediaUrl ?? (inboundMetadataJson.mediaUrl as string | undefined) ?? null,
              previewUrl: resolvedPreviewUrl ?? (inboundMetadataJson.previewUrl as string | undefined) ?? null
            }
          : {}
    });
    logger.info(
      {
        tenantId,
        channel,
        conversationId: conversation.id,
        externalMessageId,
        messageType: normalizedMessageType,
        finalMetadata: normalizedMessageType === "IMAGE" ? inboundMetadataJson : {}
      },
      "Inbound message persisted"
    );

    await this.deps.activityLogRepository.create({
      tenantId,
      leadId: lead.id,
      type: "MESSAGE_RECEIVED",
      metadataJson: { channel, externalMessageId, channelThreadId }
    });
  }
}
