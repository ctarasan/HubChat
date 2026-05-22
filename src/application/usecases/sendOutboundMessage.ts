import type { OutboundMessageRequestedPayload } from "../../domain/events.js";
import {
  INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL,
  INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME,
  INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE,
  instagramDmOutboundCaptionToSend
} from "../../domain/instagramDmMessages.js";
import pino from "pino";
import { InstagramGraphApiError } from "../../infrastructure/adapters/channels/instagramGraphApiError.js";
import type {
  ActivityLogRepository,
  ChannelAdapter,
  ConversationRepository,
  IdempotencyPort,
  LeadRepository,
  MessageRepository,
  RateLimiterPort
} from "../../domain/ports.js";
import {
  assertValidLeadStatusTransition,
  type ChannelType,
  type Conversation,
  type LeadStatus,
  type ProviderThreadType
} from "../../domain/entities.js";
import { suggestLeadStatusAfterFirstAgentReply } from "../../domain/leadInboxWorkflow.js";
import { isValidFacebookMessengerSendTarget } from "../../domain/facebookThreadTargets.js";
import {
  classifyOutboundProviderFailure,
  RetryableOutboundDeliveryError,
  TerminalOutboundDeliveryError
} from "../../lib/outboundDeliveryError.js";
import { serializeError } from "../../lib/serializeError.js";
import {
  buildChannelCapabilityContext,
  getOutboundSendUnsupportedReason,
  sendKindFromMessageType
} from "../../lib/channelCapabilities.js";

export type LineOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export type FacebookOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

export type InstagramOutboundAdapterResolver = {
  resolve(tenantId: string): Promise<ChannelAdapter>;
};

interface Dependencies {
  channelAdapterRegistry: {
    get: (channel: ChannelType) => ChannelAdapter;
  };
  /** When set, LINE outbound uses tenant-scoped runtime config (non-ENV_ONLY modes). */
  lineOutboundAdapterResolver?: LineOutboundAdapterResolver;
  /** When set, Facebook outbound uses tenant-scoped runtime config (non-ENV_ONLY modes). */
  facebookOutboundAdapterResolver?: FacebookOutboundAdapterResolver;
  /** When set, Instagram outbound uses tenant-scoped runtime config (non-ENV_ONLY modes). */
  instagramOutboundAdapterResolver?: InstagramOutboundAdapterResolver;
  conversationRepository?: ConversationRepository;
  leadRepository?: Pick<LeadRepository, "findById" | "updateStatus">;
  messageRepository: MessageRepository;
  activityLogRepository: ActivityLogRepository;
  rateLimiter: RateLimiterPort;
  idempotency: IdempotencyPort;
  onProviderLatencyMs?: (input: { tenantId: string; channel: ChannelType; messageId: string; latencyMs: number }) => void;
}

const logger = pino({ name: "send-outbound-usecase" });
const FACEBOOK_PUBLIC_REPLY_TEXT = "ขอบคุณที่ทักมา ทาง Admin จะตอบกลับผ่านทาง Inbox นะครับ";
const FACEBOOK_OUTSIDE_WINDOW_USER_MESSAGE =
  "ไม่สามารถส่งข้อความผ่าน Messenger ได้ เนื่องจากอยู่นอกช่วงเวลาที่ Meta อนุญาตให้ตอบกลับ กรุณาให้ลูกค้าทัก Inbox ใหม่ หรือใช้ Private Reply จาก comment หากยังเข้าเงื่อนไข";
const INSTAGRAM_TEXT_WITH_ATTACHMENT_MESSAGE = "Instagram DM text messages cannot include file attachments.";

type FacebookOutboundRoute =
  | { routeUsed: "MESSENGER_SEND"; targetConversationId?: string | null; channelThreadId: string; pageId: string | null }
  | { routeUsed: "PRIVATE_REPLY"; commentId: string; pageId: string }
  | { routeUsed: "DEFAULT_SEND"; channelThreadId: string };

export class SendOutboundMessageUseCase {
  constructor(private readonly deps: Dependencies) {}

  private async resolveOutboundAdapter(payload: OutboundMessageRequestedPayload): Promise<ChannelAdapter> {
    if (payload.channel === "LINE" && this.deps.lineOutboundAdapterResolver) {
      return this.deps.lineOutboundAdapterResolver.resolve(payload.tenantId);
    }
    if (payload.channel === "FACEBOOK" && this.deps.facebookOutboundAdapterResolver) {
      return this.deps.facebookOutboundAdapterResolver.resolve(payload.tenantId);
    }
    if (payload.channel === "INSTAGRAM" && this.deps.instagramOutboundAdapterResolver) {
      return this.deps.instagramOutboundAdapterResolver.resolve(payload.tenantId);
    }
    return this.deps.channelAdapterRegistry.get(payload.channel);
  }

  private async recordOutboundConversationTimestamps(
    payload: OutboundMessageRequestedPayload,
    sentAt: Date = new Date()
  ): Promise<void> {
    const repo = this.deps.conversationRepository;
    if (!repo?.recordAgentOutboundSent) return;
    await repo.recordAgentOutboundSent({
      tenantId: payload.tenantId,
      conversationId: payload.conversationId,
      sentAt
    });
  }

  private async maybePromoteLeadToContactedAfterAgentReply(
    payload: OutboundMessageRequestedPayload
  ): Promise<void> {
    const leadRepo = this.deps.leadRepository;
    if (!leadRepo?.findById || !leadRepo.updateStatus) return;
    const lead = await leadRepo.findById(payload.tenantId, payload.leadId);
    if (!lead) return;
    const next = suggestLeadStatusAfterFirstAgentReply(lead.status as LeadStatus);
    if (!next) return;
    assertValidLeadStatusTransition(lead.status as LeadStatus, next);
    await leadRepo.updateStatus(payload.leadId, next);
    await this.deps.activityLogRepository.create({
      tenantId: payload.tenantId,
      leadId: payload.leadId,
      type: "STATUS_CHANGED",
      metadataJson: { from: lead.status, to: next, source: "first_agent_reply" }
    });
  }

  private async afterSuccessfulAgentOutbound(
    payload: OutboundMessageRequestedPayload,
    sentAt: Date = new Date()
  ): Promise<void> {
    await this.recordOutboundConversationTimestamps(payload, sentAt);
    await this.maybePromoteLeadToContactedAfterAgentReply(payload);
  }

  private parseFacebookProviderError(error: unknown): {
    code: number | null;
    subcode: number | null;
    message: string | null;
    fbtraceId: string | null;
    type: string | null;
  } {
    if (error instanceof InstagramGraphApiError) {
      const m = error.meta;
      return {
        code: m.code ?? null,
        subcode: m.error_subcode ?? null,
        message: m.message ?? null,
        fbtraceId: m.fbtrace_id ?? null,
        type: m.type ?? null
      };
    }
    const raw = error instanceof Error ? error.message : String(error);
    const jsonStart = raw.indexOf("{");
    if (jsonStart < 0) {
      return { code: null, subcode: null, message: raw, fbtraceId: null, type: null };
    }
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string; type?: string };
      };
      const providerError = parsed.error;
      return {
        code: typeof providerError?.code === "number" ? providerError.code : null,
        subcode: typeof providerError?.error_subcode === "number" ? providerError.error_subcode : null,
        message: typeof providerError?.message === "string" ? providerError.message : raw,
        fbtraceId: typeof providerError?.fbtrace_id === "string" ? providerError.fbtrace_id : null,
        type: typeof providerError?.type === "string" ? providerError.type : null
      };
    } catch {
      return { code: null, subcode: null, message: raw, fbtraceId: null, type: null };
    }
  }

  private parseMetaProviderError(error: unknown): {
    code: number | null;
    subcode: number | null;
    message: string | null;
    fbtraceId: string | null;
    type: string | null;
  } {
    return this.parseFacebookProviderError(error);
  }

  private isFacebookOutsideWindowError(error: unknown): boolean {
    const parsed = this.parseMetaProviderError(error);
    if (parsed.code !== 10) return false;
    if (parsed.subcode !== null && parsed.subcode !== 2018278) return false;
    return (parsed.message ?? "").toLowerCase().includes("outside the allowed window");
  }

  private validateOutboundCapability(
    payload: OutboundMessageRequestedPayload,
    conversation: Conversation | null
  ): string | null {
    return getOutboundSendUnsupportedReason(
      buildChannelCapabilityContext({
        channel: payload.channel,
        providerThreadType: conversation?.providerThreadType ?? null,
        privateReplySentAt: conversation?.privateReplySentAt ?? null
      }),
      sendKindFromMessageType(payload.messageType)
    );
  }

  /** Returns a user-facing reason string, or null when ok. */
  private validateInstagramDmOutbound(
    payload: OutboundMessageRequestedPayload,
    conversation: Conversation | null
  ): string | null {
    if (!conversation) return "Instagram DM outbound requires conversation context.";
    if (conversation.channelType !== "INSTAGRAM") return "Conversation channel does not match Instagram outbound.";
    const ptt = conversation.providerThreadType as ProviderThreadType | null | undefined;
    if (ptt !== "INSTAGRAM_DM") return "Instagram outbound is only supported for Instagram DM threads.";
    const thread = payload.channelThreadId?.trim() ?? "";
    if (!thread.startsWith("ig:user:")) return 'Instagram DM requires channelThreadId to start with "ig:user:".';

    const mt = payload.messageType ?? "TEXT";

    if (mt !== "TEXT" && mt !== "IMAGE") {
      return INSTAGRAM_OUTBOUND_UNSUPPORTED_MEDIA_TYPE;
    }

    if (mt === "IMAGE") {
      const rawUrl = typeof payload.mediaUrl === "string" ? payload.mediaUrl.trim() : "";
      if (!rawUrl || !/^https:\/\//i.test(rawUrl)) {
        return INSTAGRAM_OUTBOUND_IMAGE_REQUIRES_HTTPS_URL;
      }
      const mime = (payload.mediaMimeType ?? "").trim().toLowerCase();
      if (!mime || (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp")) {
        return INSTAGRAM_OUTBOUND_IMAGE_UNSUPPORTED_MIME;
      }
      const captionToSend = instagramDmOutboundCaptionToSend(payload.content);
      if (captionToSend) {
        const bytes = new TextEncoder().encode(captionToSend).length;
        if (bytes > 1000) return "Instagram DM message text must be at most 1000 bytes (UTF-8).";
      }
      return null;
    }

    const trimmed = payload.content.trim();
    if (!trimmed.length) return "Instagram DM message text cannot be empty.";
    const bytes = new TextEncoder().encode(trimmed).length;
    if (bytes > 1000) return "Instagram DM message text must be at most 1000 bytes (UTF-8).";
    if (
      payload.mediaUrl ||
      payload.previewUrl ||
      payload.mediaMimeType ||
      payload.fileName != null ||
      payload.fileSizeBytes != null ||
      payload.width != null ||
      payload.height != null
    ) {
      return INSTAGRAM_TEXT_WITH_ATTACHMENT_MESSAGE;
    }
    return null;
  }

  private isEligibleForFacebookPrivateReplyFallback(
    conversation: Conversation | null,
    payload: OutboundMessageRequestedPayload
  ): boolean {
    if (!conversation) return false;
    const outboundType = payload.messageType ?? "TEXT";
    if (outboundType !== "TEXT") return false;
    if (
      payload.mediaUrl ||
      payload.previewUrl ||
      payload.mediaMimeType ||
      payload.fileName ||
      payload.fileSizeBytes ||
      payload.width ||
      payload.height
    ) {
      return false;
    }
    if (conversation.providerThreadType !== "FACEBOOK_COMMENT") return false;
    if (!conversation.providerCommentId?.trim()) return false;
    if (!conversation.providerPageId?.trim()) return false;
    if (conversation.privateReplySentAt) return false;
    const ageMs = Date.now() - conversation.lastMessageAt.getTime();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    return ageMs >= 0 && ageMs <= maxAgeMs;
  }

  private isValidMessengerDmConversationTarget(selected: Conversation, candidate: Conversation): boolean {
    if (candidate.providerThreadType !== "MESSENGER_DM") return false;
    if (
      selected.providerPageId &&
      candidate.providerPageId &&
      selected.providerPageId.trim() &&
      candidate.providerPageId.trim() &&
      selected.providerPageId.trim() !== candidate.providerPageId.trim()
    ) {
      return false;
    }
    if (
      selected.providerExternalUserId &&
      candidate.providerExternalUserId &&
      selected.providerExternalUserId.trim() &&
      candidate.providerExternalUserId.trim() &&
      selected.providerExternalUserId.trim() !== candidate.providerExternalUserId.trim()
    ) {
      return false;
    }
    return isValidFacebookMessengerSendTarget(candidate.channelThreadId, candidate.providerExternalUserId, { allowRawPsid: true });
  }

  private async ensureFacebookCommentAcknowledgement(input: {
    payload: OutboundMessageRequestedPayload;
    conversation: Conversation;
    adapter: ChannelAdapter;
    commentId: string;
    markConversationId?: string;
  }): Promise<void> {
    if (input.conversation.facebookPublicReplySentAt || !input.adapter.sendPublicCommentReply) return;
    const pageId = (input.conversation.providerPageId ?? "").trim();
    if (!pageId) return;
    try {
      await input.adapter.sendPublicCommentReply({
        pageId,
        commentId: input.commentId,
        text: FACEBOOK_PUBLIC_REPLY_TEXT
      });
      if (this.deps.conversationRepository?.markFacebookPublicReplySent) {
        await this.deps.conversationRepository.markFacebookPublicReplySent(input.markConversationId ?? input.payload.conversationId);
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

  private async ensureGroupedFacebookCommentAcknowledgement(input: {
    payload: OutboundMessageRequestedPayload;
    selected: Conversation;
    adapter: ChannelAdapter;
  }): Promise<void> {
    if (input.selected.providerThreadType !== "MESSENGER_DM") return;
    if (Array.isArray(input.payload.conversationIds) && this.deps.conversationRepository?.findById) {
      for (const conversationId of input.payload.conversationIds) {
        if (conversationId === input.selected.id) continue;
        const candidate = await this.deps.conversationRepository.findById(input.payload.tenantId, conversationId);
        if (!candidate || candidate.providerThreadType !== "FACEBOOK_COMMENT") continue;
        if (candidate.facebookPublicReplySentAt) continue;
        if (
          input.selected.providerExternalUserId &&
          candidate.providerExternalUserId &&
          input.selected.providerExternalUserId.trim() &&
          candidate.providerExternalUserId.trim() &&
          input.selected.providerExternalUserId.trim() !== candidate.providerExternalUserId.trim()
        ) {
          continue;
        }
        if (
          input.selected.providerPageId &&
          candidate.providerPageId &&
          input.selected.providerPageId.trim() &&
          candidate.providerPageId.trim() &&
          input.selected.providerPageId.trim() !== candidate.providerPageId.trim()
        ) {
          continue;
        }
        const commentId = candidate.providerCommentId?.trim() || candidate.channelThreadId?.replace(/^comment:/, "").trim() || "";
        if (!commentId) continue;
        await this.ensureFacebookCommentAcknowledgement({
          payload: input.payload,
          conversation: candidate,
          adapter: input.adapter,
          commentId,
          markConversationId: candidate.id
        });
        return;
      }
    }
    const pageId = input.selected.providerPageId?.trim();
    const externalUserId = input.selected.providerExternalUserId?.trim();
    let fallbackComment: Conversation | null = null;
    if (pageId && externalUserId && this.deps.conversationRepository?.findLatestFacebookCommentByParticipant) {
      fallbackComment = await this.deps.conversationRepository.findLatestFacebookCommentByParticipant({
        tenantId: input.payload.tenantId,
        providerPageId: pageId,
        providerExternalUserId: externalUserId
      });
    }
    if (!fallbackComment && this.deps.conversationRepository?.findLatestFacebookCommentByLead) {
      fallbackComment = await this.deps.conversationRepository.findLatestFacebookCommentByLead({
        tenantId: input.payload.tenantId,
        leadId: input.payload.leadId,
        providerPageId: pageId || undefined
      });
    }
    if (!fallbackComment || fallbackComment.facebookPublicReplySentAt) return;
    const fallbackCommentId = fallbackComment.providerCommentId?.trim() || fallbackComment.channelThreadId?.replace(/^comment:/, "").trim() || "";
    if (!fallbackCommentId) return;
    await this.ensureFacebookCommentAcknowledgement({
      payload: input.payload,
      conversation: fallbackComment,
      adapter: input.adapter,
      commentId: fallbackCommentId,
      markConversationId: fallbackComment.id
    });
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
      await this.ensureGroupedFacebookCommentAcknowledgement({
        payload: input.payload,
        selected,
        adapter: input.adapter
      });
      if (!isValidFacebookMessengerSendTarget(selected.channelThreadId, selected.providerExternalUserId, { allowRawPsid: true })) {
        throw new Error("Invalid Facebook Messenger send target on selected MESSENGER_DM conversation.");
      }
      return {
        routeUsed: "MESSENGER_SEND",
        channelThreadId: selected.channelThreadId,
        targetConversationId: selected.id,
        pageId: selected.providerPageId?.trim() || null
      };
    }
    if (selected.providerThreadType !== "FACEBOOK_COMMENT") {
      return { routeUsed: "DEFAULT_SEND", channelThreadId: input.payload.channelThreadId };
    }

    const commentId = selected.providerCommentId?.trim() || selected.channelThreadId?.replace(/^comment:/, "").trim() || "";

    if (commentId) {
      await this.ensureFacebookCommentAcknowledgement({
        payload: input.payload,
        conversation: selected,
        adapter: input.adapter,
        commentId
      });
    }

    if (Array.isArray(input.payload.conversationIds) && this.deps.conversationRepository?.findById) {
      for (const conversationId of input.payload.conversationIds) {
        const candidate = await this.deps.conversationRepository.findById(input.payload.tenantId, conversationId);
        if (candidate && this.isValidMessengerDmConversationTarget(selected, candidate)) {
          return {
            routeUsed: "MESSENGER_SEND",
            channelThreadId: candidate.channelThreadId,
            targetConversationId: candidate.id,
            pageId: candidate.providerPageId?.trim() || selected.providerPageId?.trim() || null
          };
        }
      }
    }

    const pageId = selected.providerPageId?.trim();
    const externalUserId = selected.providerExternalUserId?.trim();
    if (pageId && externalUserId && this.deps.conversationRepository?.findFacebookMessengerDmByParticipant) {
      const dmConversation = await this.deps.conversationRepository.findFacebookMessengerDmByParticipant({
        tenantId: input.payload.tenantId,
        providerPageId: pageId,
        providerExternalUserId: externalUserId
      });
      if (dmConversation) {
        if (!this.isValidMessengerDmConversationTarget(selected, dmConversation)) {
          throw new Error("Repository returned invalid Facebook MESSENGER_DM target.");
        }
        return {
          routeUsed: "MESSENGER_SEND",
          channelThreadId: dmConversation.channelThreadId,
          targetConversationId: dmConversation.id,
          pageId: dmConversation.providerPageId?.trim() || selected.providerPageId?.trim() || null
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
        targetConversationId: selected.id,
        pageId: selected.providerPageId?.trim() || null
      };
    }
    const capabilityIssue = getOutboundSendUnsupportedReason(
      buildChannelCapabilityContext({
        channel: "FACEBOOK",
        providerThreadType: selected.providerThreadType ?? null,
        privateReplySentAt: selected.privateReplySentAt ?? null
      }),
      sendKindFromMessageType(outboundType),
      { facebookPrivateReplyRoute: true }
    );
    if (capabilityIssue) {
      throw new Error(capabilityIssue);
    }
    if (!commentId) {
      throw new Error("Cannot use Private Reply without provider_comment_id");
    }
    const pageIdForPrivateReply = selected.providerPageId?.trim();
    if (!pageIdForPrivateReply) {
      throw new Error("Cannot use Private Reply without provider_page_id");
    }
    return { routeUsed: "PRIVATE_REPLY", commentId, pageId: pageIdForPrivateReply };
  }

  async execute(payload: OutboundMessageRequestedPayload): Promise<void> {
    const scope = "outbound-message";
    const idempotencyKey = `${payload.tenantId}:${payload.messageId}`;
    const providerRetryKey = payload.messageId; // LINE requires UUID format for X-Line-Retry-Key.
    if (await this.deps.idempotency.hasProcessed(scope, idempotencyKey)) return;

    const conversation = this.deps.conversationRepository?.findById
      ? await this.deps.conversationRepository.findById(payload.tenantId, payload.conversationId)
      : null;

    if (payload.channel !== "FACEBOOK") {
      const capabilityIssue = this.validateOutboundCapability(payload, conversation);
      if (capabilityIssue) {
        await this.deps.messageRepository.markFailed(payload.messageId, capabilityIssue);
        throw new Error(capabilityIssue);
      }
    }

    if (payload.channel === "INSTAGRAM") {
      const igErr = this.validateInstagramDmOutbound(payload, conversation);
      if (igErr) {
        await this.deps.messageRepository.markFailed(payload.messageId, igErr);
        throw new Error(igErr);
      }
    }

    await this.deps.rateLimiter.checkOrThrow(payload.tenantId, payload.channel);
    const adapter = await this.resolveOutboundAdapter(payload);

    try {
      const route =
        payload.channel === "FACEBOOK"
          ? await this.resolveFacebookOutboundRoute({ payload, conversation, adapter })
          : payload.channel === "INSTAGRAM"
            ? { routeUsed: "INSTAGRAM_SEND" as const, channelThreadId: payload.channelThreadId }
            : { routeUsed: "DEFAULT_SEND" as const, channelThreadId: payload.channelThreadId };
      logger.info(
        {
          selectedConversationId: payload.conversationId,
          payloadConversationIds: payload.conversationIds ?? [],
          resolvedTargetConversationId:
            route.routeUsed === "MESSENGER_SEND" ? (route.targetConversationId ?? conversation?.id ?? null) : conversation?.id ?? null,
          routeUsed: route.routeUsed,
          pageId: route.routeUsed === "MESSENGER_SEND" ? route.pageId : conversation?.providerPageId ?? null,
          channelThreadId: route.routeUsed === "PRIVATE_REPLY" ? null : route.channelThreadId,
          providerExternalUserId: conversation?.providerExternalUserId ?? null,
          providerCommentId: conversation?.providerCommentId ?? null
        },
        "Facebook outbound pre-send route selection"
      );
      if (route.routeUsed === "PRIVATE_REPLY") {
        if (!adapter.sendPrivateReply) throw new Error("Facebook Private Reply adapter capability is not available.");
        const providerStartedAt = Date.now();
        const result = await adapter.sendPrivateReply({
          pageId: route.pageId,
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
        await this.afterSuccessfulAgentOutbound(payload);
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
      let effectiveRouteUsed: "MESSENGER_SEND" | "PRIVATE_REPLY" | "INSTAGRAM_SEND" | null =
        route.routeUsed === "MESSENGER_SEND" ? "MESSENGER_SEND" : route.routeUsed === "INSTAGRAM_SEND" ? "INSTAGRAM_SEND" : null;
      let fallbackRouteUsed: "PRIVATE_REPLY" | null = null;
      let result: { externalMessageId: string };
      try {
        result = await adapter.sendMessage({
          pageId: route.routeUsed === "MESSENGER_SEND" ? route.pageId : null,
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
          height: payload.height,
          outboundDebugContext:
            payload.channel === "INSTAGRAM"
              ? { messageId: payload.messageId, conversationId: payload.conversationId }
              : undefined
        });
      } catch (sendError) {
        const outsideWindow = payload.channel === "FACEBOOK" && this.isFacebookOutsideWindowError(sendError);
        const canFallback =
          outsideWindow &&
          route.routeUsed === "MESSENGER_SEND" &&
          this.isEligibleForFacebookPrivateReplyFallback(conversation, payload) &&
          Boolean(adapter.sendPrivateReply);
        if (!canFallback) throw sendError;

        const parsed = this.parseFacebookProviderError(sendError);
        logger.warn(
          {
            tenantId: payload.tenantId,
            selectedConversationId: payload.conversationId,
            originalRouteUsed: "MESSENGER_SEND",
            fallbackRouteUsed: "PRIVATE_REPLY",
            metaErrorCode: parsed.code,
            metaErrorSubcode: parsed.subcode,
            providerCommentId: conversation?.providerCommentId ?? null,
            providerPageId: conversation?.providerPageId ?? null,
            providerExternalUserId: conversation?.providerExternalUserId ?? null
          },
          "Facebook outbound outside-window fallback to private reply"
        );

        result = await adapter.sendPrivateReply!({
          pageId: conversation!.providerPageId!,
          commentId: conversation!.providerCommentId!,
          content: payload.content,
          idempotencyKey: providerRetryKey,
          messageType: "TEXT"
        });
        fallbackRouteUsed = "PRIVATE_REPLY";
        effectiveRouteUsed = "PRIVATE_REPLY";
        if (this.deps.conversationRepository?.markFacebookCommentPrivateReplySent && conversation) {
          await this.deps.conversationRepository.markFacebookCommentPrivateReplySent({
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            privateReplyCommentId: conversation.providerCommentId!,
            convertedToDm: false,
            nextChannelThreadId: null
          });
        }
      }
      const providerLatencyMs = Date.now() - providerStartedAt;
      this.deps.onProviderLatencyMs?.({
        tenantId: payload.tenantId,
        channel: payload.channel,
        messageId: payload.messageId,
        latencyMs: providerLatencyMs
      });

      await this.deps.messageRepository.markSent(payload.messageId, result.externalMessageId);
      await this.afterSuccessfulAgentOutbound(payload);
      await this.deps.activityLogRepository.create({
        tenantId: payload.tenantId,
        leadId: payload.leadId,
        type: "MESSAGE_SENT",
        metadataJson: {
          externalMessageId: result.externalMessageId,
          channel: payload.channel,
          messageType: payload.messageType ?? "TEXT",
          routeUsed: effectiveRouteUsed,
          fallbackRouteUsed,
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
          routeUsed: effectiveRouteUsed,
          fallbackRouteUsed,
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
      if (payload.channel === "FACEBOOK" && this.isFacebookOutsideWindowError(error)) {
        const parsed = this.parseMetaProviderError(error);
        const storedError = `Facebook Send API outside-window (${parsed.code ?? "unknown"}/${parsed.subcode ?? "unknown"}): ${
          parsed.message ?? "outside the allowed window"
        } | ${FACEBOOK_OUTSIDE_WINDOW_USER_MESSAGE}`;
        await this.deps.messageRepository.markFailed(payload.messageId, storedError);
        logger.error(
          {
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            messageId: payload.messageId,
            channel: payload.channel,
            error: serializeError(error)
          },
          "Outbound send failed"
        );
        throw error;
      }

      if (payload.channel === "INSTAGRAM") {
        const classification = classifyOutboundProviderFailure("INSTAGRAM", error);
        const parsed = this.parseMetaProviderError(error);
        logger.error(
          {
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            messageId: payload.messageId,
            channel: payload.channel,
            providerThreadType: "INSTAGRAM_DM",
            routeUsed: "INSTAGRAM_SEND",
            metaErrorCode: parsed.code,
            metaErrorSubcode: parsed.subcode,
            metaErrorMessage: parsed.message,
            metaErrorType: parsed.type,
            fbtraceId: parsed.fbtraceId,
            deliveryErrorCode: classification.internalCode,
            retryable: classification.retryable,
            error: serializeError(error)
          },
          "Instagram outbound provider failure"
        );
        if (!classification.retryable) {
          await this.deps.messageRepository.markFailed(payload.messageId, {
            userFacingMessage: classification.userFacingMessage,
            deliveryErrorCode: classification.internalCode,
            technicalReason: classification.technicalSummary
          });
          await this.deps.idempotency.markProcessed(scope, idempotencyKey);
          throw new TerminalOutboundDeliveryError(classification.userFacingMessage, classification.internalCode, error);
        }
        throw new RetryableOutboundDeliveryError(
          classification.internalCode,
          classification.userFacingMessage,
          classification.technicalSummary,
          error
        );
      }

      if (payload.channel === "FACEBOOK") {
        const classification = classifyOutboundProviderFailure("FACEBOOK", error);
        logger.error(
          {
            tenantId: payload.tenantId,
            conversationId: payload.conversationId,
            messageId: payload.messageId,
            channel: payload.channel,
            deliveryErrorCode: classification.internalCode,
            retryable: classification.retryable,
            error: serializeError(error)
          },
          "Facebook outbound provider failure"
        );
        if (!classification.retryable) {
          await this.deps.messageRepository.markFailed(payload.messageId, {
            userFacingMessage: classification.userFacingMessage,
            deliveryErrorCode: classification.internalCode,
            technicalReason: classification.technicalSummary
          });
          await this.deps.idempotency.markProcessed(scope, idempotencyKey);
          throw new TerminalOutboundDeliveryError(classification.userFacingMessage, classification.internalCode, error);
        }
        throw new RetryableOutboundDeliveryError(
          classification.internalCode,
          classification.userFacingMessage,
          classification.technicalSummary,
          error
        );
      }

      let storedError = String(error);
      if (error instanceof InstagramGraphApiError) {
        const m = error.meta;
        storedError = [
          m.message ?? "Instagram send failed",
          `http=${error.httpStatus}`,
          `code=${m.code ?? "n/a"}`,
          `subcode=${m.error_subcode ?? "n/a"}`,
          `type=${m.type ?? "n/a"}`,
          `fbtrace_id=${m.fbtrace_id ?? "n/a"}`,
          `raw=${error.rawBody}`
        ].join(" | ");
      }
      await this.deps.messageRepository.markFailed(payload.messageId, storedError);
      logger.error(
        {
          tenantId: payload.tenantId,
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          channel: payload.channel,
          error: serializeError(error)
        },
        "Outbound send failed"
      );
      throw error;
    }
  }
}
