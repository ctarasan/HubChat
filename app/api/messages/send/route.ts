import { NextRequest } from "next/server";
import pino from "pino";
import { SendMessageSchema } from "../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import type { AuthContext } from "../../../../src/interfaces/api/auth.js";
import {
  canReplyToConversation,
  type ConversationReplyScoped
} from "../../../../src/application/authorization/conversationPermissions.js";
const logger = pino({ name: "messages-send-api" });

type SendRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

function resolveChannelThreadId(input: {
  channel: string;
  channelThreadId?: string;
  facebookTargetType?: "MESSENGER" | "COMMENT";
  facebookTargetId?: string;
}): string {
  if (input.channel === "FACEBOOK" && input.facebookTargetType && input.facebookTargetId) {
    return input.facebookTargetType === "MESSENGER"
      ? `user:${input.facebookTargetId}`
      : `comment:${input.facebookTargetId}`;
  }
  if (!input.channelThreadId) {
    throw new Error("Missing channelThreadId");
  }
  return input.channelThreadId;
}

function toReplyScope(c: { tenantId: string; assignedAgentId?: string | null }): ConversationReplyScoped {
  return { tenantId: c.tenantId, assignedAgentId: c.assignedAgentId ?? null };
}

function replyOwnershipForbiddenMessage(auth: AuthContext, conv: ConversationReplyScoped): string {
  if (conv.tenantId !== auth.tenantId) {
    return "You are not allowed to reply to this conversation.";
  }
  if (auth.role === "MANAGER" || auth.role === "ADMIN") {
    return "You are not allowed to reply to this conversation.";
  }
  if (auth.role === "SALES") {
    if (!auth.salesAgentId) {
      return "Your sales agent profile is not active for this tenant; you cannot send replies.";
    }
    if (!conv.assignedAgentId) {
      return "You can only reply to conversations assigned to you.";
    }
    if (conv.assignedAgentId !== auth.salesAgentId) {
      return "This conversation is assigned to another sales agent.";
    }
  }
  return "You are not allowed to reply to this conversation.";
}

export function createMessagesSendPostHandler(deps: SendRouteDeps) {
  return async function POST(req: Pick<NextRequest, "json" | "headers">) {
    try {
      const auth = await deps.requireAuth(req as NextRequest, ["SALES", "MANAGER", "ADMIN"]);
      const tenantId = auth.tenantId;
      const body = await req.json();
      const parsed = SendMessageSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);
      if (parsed.data.tenantId !== tenantId) return badRequest("tenantId mismatch");
      const resolvedChannelThreadId = resolveChannelThreadId(parsed.data);

      if (parsed.data.type === "image" || parsed.data.type === "document_pdf") {
        logger.info(
          {
            tenantId,
            channel: parsed.data.channel,
            conversationId: parsed.data.conversationId,
            type: parsed.data.type,
            mediaUrl: parsed.data.mediaUrl,
            previewUrl: parsed.data.previewUrl ?? parsed.data.mediaUrl,
            mediaMimeType: parsed.data.mediaMimeType,
            fileName: parsed.data.fileName ?? null,
            fileSizeBytes: parsed.data.fileSizeBytes ?? null
          },
          "Outbound media validation passed; provider-fetchable URL decision applied"
        );
      }

      const { outboundCommandRepository, conversationRepository } = deps.apiBootstrap();
      const selectedConversation = conversationRepository.findById
        ? await conversationRepository.findById(tenantId, parsed.data.conversationId)
        : null;
      if (!selectedConversation) return badRequest("Conversation not found");
      const groupedConversationIds = Array.from(new Set([parsed.data.conversationId, ...(parsed.data.conversationIds ?? [])]));
      let resolvedSendConversation = selectedConversation;
      if (parsed.data.channel === "FACEBOOK" && conversationRepository.findById) {
        for (const conversationId of groupedConversationIds) {
          const candidate = await conversationRepository.findById(tenantId, conversationId);
          if (candidate?.providerThreadType === "MESSENGER_DM") {
            resolvedSendConversation = candidate;
            break;
          }
        }
      }
      const conversationsToAuthorize = [selectedConversation];
      if (resolvedSendConversation.id !== selectedConversation.id) {
        conversationsToAuthorize.push(resolvedSendConversation);
      }
      for (const conv of conversationsToAuthorize) {
        const scope = toReplyScope(conv);
        if (!canReplyToConversation(auth, scope)) {
          return forbidden(replyOwnershipForbiddenMessage(auth, scope));
        }
      }
      const result = await outboundCommandRepository.createOutboundMessageAndOutbox({
        tenantId,
        leadId: parsed.data.leadId,
        conversationId: parsed.data.conversationId,
        conversationIds: groupedConversationIds,
        channel: parsed.data.channel,
        channelThreadId: resolvedSendConversation.channelThreadId || resolvedChannelThreadId,
        content: parsed.data.content ?? "",
        messageType:
          parsed.data.type === "image"
            ? "IMAGE"
            : parsed.data.type === "document_pdf"
              ? "DOCUMENT_PDF"
              : "TEXT",
        mediaUrl: parsed.data.mediaUrl,
        previewUrl: parsed.data.previewUrl,
        mediaMimeType: parsed.data.mediaMimeType,
        fileName: parsed.data.fileName,
        fileSizeBytes: parsed.data.fileSizeBytes,
        width: parsed.data.width,
        height: parsed.data.height
      });

      return ok({ data: { messageId: result.messageId, status: "QUEUED" } }, 202);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export async function POST(req: NextRequest) {
  const handler = createMessagesSendPostHandler({ requireAuth, apiBootstrap });
  return handler(req);
}

export async function _POST_FOR_TEST_ONLY(req: Pick<NextRequest, "json" | "headers">) {
  const handler = createMessagesSendPostHandler({ requireAuth, apiBootstrap });
  return handler(req);
}
