import { NextRequest } from "next/server";
import { SendMessageSchema } from "../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

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

    const { messageRepository, queue, activityLogRepository, conversationRepository } = apiBootstrap();
    const message = await messageRepository.create({
      tenantId,
      conversationId: parsed.data.conversationId,
      channelType: parsed.data.channel,
      externalMessageId: null,
      direction: "OUTBOUND",
      senderType: "SALES",
      content: parsed.data.content
    });

    await conversationRepository.touchLastMessage(parsed.data.conversationId, new Date());
    await activityLogRepository.create({
      tenantId,
      leadId: parsed.data.leadId,
      type: "MESSAGE_SENT",
      metadataJson: { messageId: message.id, queued: true }
    });

    await queue.enqueue(
      "message.outbound.requested",
      {
        tenantId,
        leadId: parsed.data.leadId,
        messageId: message.id,
        conversationId: parsed.data.conversationId,
        channel: parsed.data.channel,
        channelThreadId: resolvedChannelThreadId,
        content: parsed.data.content
      },
      {
        tenantId,
        idempotencyKey: `outbound:${tenantId}:${message.id}`
      }
    );

    return ok({ data: { messageId: message.id, status: "QUEUED" } }, 202);
  } catch (error) {
    if (String(error).includes("Unauthorized")) return unauthorized();
    if (String(error).includes("Forbidden")) return forbidden();
    return serverError(error);
  }
}
