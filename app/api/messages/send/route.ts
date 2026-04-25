import { NextRequest } from "next/server";
import pino from "pino";
import { SendMessageSchema } from "../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
const logger = pino({ name: "messages-send-api" });

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

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
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

    const { outboundCommandRepository, conversationRepository } = apiBootstrap();
    const conversation = conversationRepository.findById
      ? await conversationRepository.findById(tenantId, parsed.data.conversationId)
      : null;
    if (!conversation) return badRequest("Conversation not found");
    const isFirstFacebookCommentReply =
      parsed.data.channel === "FACEBOOK" &&
      conversation.providerThreadType === "FACEBOOK_COMMENT" &&
      !conversation.privateReplySentAt;
    const facebookDmThreadId =
      parsed.data.channel === "FACEBOOK" &&
      !isFirstFacebookCommentReply &&
      conversation.providerExternalUserId?.trim()
        ? `user:${conversation.providerExternalUserId.trim()}`
        : null;
    if (isFirstFacebookCommentReply && parsed.data.type !== "text") {
      return badRequest("First Facebook comment reply must be text only.");
    }
    if (isFirstFacebookCommentReply && !conversation.providerCommentId) {
      return badRequest("Cannot send private reply: missing Facebook comment ID.");
    }

    const result = await outboundCommandRepository.createOutboundMessageAndOutbox({
      tenantId,
      leadId: parsed.data.leadId,
      conversationId: parsed.data.conversationId,
      channel: parsed.data.channel,
      channelThreadId: isFirstFacebookCommentReply
        ? `comment:${conversation.providerCommentId}`
        : facebookDmThreadId ?? resolvedChannelThreadId,
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
}
