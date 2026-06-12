import pino from "pino";
import type { FacebookMessengerEchoNormalizedPayload } from "../../domain/events.js";
import type {
  ActivityLogRepository,
  ConversationRepository,
  MessageRepository
} from "../../domain/ports.js";
import { normalizeFacebookMessengerThreadTarget } from "../../domain/facebookThreadTargets.js";
import { buildLastMessagePreview } from "../conversationPreview.js";

export type FacebookMessengerEchoProcessResult =
  | "inserted"
  | "deduplicated"
  | "conversation_not_found"
  | "unsupported_attachment"
  | "invalid_payload";

const logger = pino({ name: "process-facebook-messenger-echo" });

interface Dependencies {
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
}

export class ProcessFacebookMessengerEchoUseCase {
  constructor(private readonly deps: Dependencies) {}

  async execute(payload: FacebookMessengerEchoNormalizedPayload): Promise<FacebookMessengerEchoProcessResult> {
    const tenantId = payload.tenantId?.trim();
    const externalMessageId = payload.externalMessageId?.trim();
    const customerPsid = payload.customerPsid?.trim();
    if (!tenantId || !externalMessageId || !customerPsid) {
      return "invalid_payload";
    }

    const messageType = payload.messageType === "IMAGE" ? "IMAGE" : "TEXT";
    if (messageType === "IMAGE" && !payload.mediaUrl?.trim()) {
      logger.info(
        { event_type: "facebook_message_echo", result: "unsupported_attachment", has_mid: true },
        "facebook_message_echo"
      );
      return "unsupported_attachment";
    }

    const existing = this.deps.messageRepository.findByTenantChannelExternalMessageId
      ? await this.deps.messageRepository.findByTenantChannelExternalMessageId(
          tenantId,
          "FACEBOOK",
          externalMessageId
        )
      : null;
    if (existing) {
      if (
        existing.direction === "OUTBOUND" &&
        this.deps.messageRepository.getDeliverySnapshot &&
        existing.id
      ) {
        const snap = await this.deps.messageRepository.getDeliverySnapshot(existing.id);
        if (snap?.deliveryStatus === "PENDING") {
          await this.deps.messageRepository.markSent(existing.id, externalMessageId);
        }
      }
      logger.info(
        { event_type: "facebook_message_echo", result: "deduplicated", has_mid: true },
        "facebook_message_echo"
      );
      return "deduplicated";
    }

    const pageId = payload.facebookPageId?.trim() ?? "";
    let conversation =
      pageId && this.deps.conversationRepository.findFacebookMessengerDmByParticipant
        ? await this.deps.conversationRepository.findFacebookMessengerDmByParticipant({
            tenantId,
            providerPageId: pageId,
            providerExternalUserId: customerPsid
          })
        : null;

    const threadCandidates = [
      normalizeFacebookMessengerThreadTarget(payload.channelThreadId, customerPsid),
      payload.channelThreadId.trim(),
      customerPsid
    ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

    for (const threadId of threadCandidates) {
      if (conversation) break;
      conversation = await this.deps.conversationRepository.findByThread(tenantId, "FACEBOOK", threadId);
    }

    if (!conversation) {
      logger.info(
        { event_type: "facebook_message_echo", result: "conversation_not_found", has_mid: true },
        "facebook_message_echo"
      );
      return "conversation_not_found";
    }

    const occurredAt = new Date(payload.occurredAt);
    const safeOccurredAt = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
    const effectiveContent = messageType === "IMAGE" ? "[image]" : payload.text;
    const preview = buildLastMessagePreview({
      messageType,
      content: messageType === "IMAGE" ? "[Image]" : effectiveContent
    });

    await this.deps.messageRepository.create({
      tenantId,
      conversationId: conversation.id,
      channelType: "FACEBOOK",
      externalMessageId,
      messageType,
      direction: "OUTBOUND",
      senderType: "SYSTEM",
      content: effectiveContent,
      occurredAt: safeOccurredAt,
      mediaUrl: messageType === "IMAGE" ? payload.mediaUrl ?? null : null,
      previewUrl: messageType === "IMAGE" ? payload.previewUrl ?? payload.mediaUrl ?? null : null,
      metadataJson: {
        delivery_status: "SENT",
        sent_at: safeOccurredAt.toISOString(),
        outbound_origin: "facebook_native_echo"
      }
    });

    if (this.deps.conversationRepository.recordAgentOutboundSent) {
      await this.deps.conversationRepository.recordAgentOutboundSent({
        tenantId,
        conversationId: conversation.id,
        sentAt: safeOccurredAt
      });
    }

    await this.deps.conversationRepository.touchLastMessage(conversation.id, safeOccurredAt, {
      lastMessagePreview: preview.preview,
      lastMessageType: preview.type
    });

    if (conversation.leadId) {
      await this.deps.activityLogRepository.create({
        tenantId,
        leadId: conversation.leadId,
        type: "MESSAGE_SENT",
        metadataJson: {
          channel: "FACEBOOK",
          externalMessageId,
          outboundOrigin: "facebook_native_echo"
        }
      });
    }

    logger.info(
      { event_type: "facebook_message_echo", result: "inserted", has_mid: true },
      "facebook_message_echo"
    );
    return "inserted";
  }
}
