import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { parseMessageLimit } from "../../../../../src/interfaces/api/pagination.js";
import { toMessageListItemDto } from "../../../../../src/interfaces/api/inboxDtos.js";
import { canReplyToConversation } from "../../../../../src/application/authorization/conversationPermissions.js";

type Params = { params: Promise<{ id: string }> };

type MessagesRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

function parseIncludeConversationIds(raw: string | null, primaryId: string): string[] {
  const ids = new Set<string>([primaryId]);
  if (!raw?.trim()) return [...ids];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

export function createConversationMessagesGetHandler(deps: MessagesRouteDeps) {
  return async function GET(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const tenantId = auth.tenantId;
      const { id: conversationId } = await params;
      const { messageRepository, conversationRepository } = deps.apiBootstrap();
      const includeRaw = req.nextUrl.searchParams.get("includeConversationIds");
      const conversationIds = parseIncludeConversationIds(includeRaw, conversationId);
      const limit = parseMessageLimit(req.nextUrl.searchParams.get("limit") ?? undefined);
      const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

      for (const cid of conversationIds) {
        const conv = await conversationRepository.findByIdForAssignment(tenantId, cid);
        if (!conv) throw new Error("Conversation not found");
        if (
          !canReplyToConversation(auth, {
            tenantId: conv.tenantId,
            assignedAgentId: conv.assignedAgentId
          })
        ) {
          throw new Error("Forbidden");
        }
      }

      const result =
        conversationIds.length > 1 && messageRepository.listByConversationIds
          ? await messageRepository.listByConversationIds({
              tenantId,
              conversationIds,
              cursor,
              limit
            })
          : await messageRepository.listByConversation({
              tenantId,
              conversationId,
              cursor,
              limit
            });

      const data = result.items.map(toMessageListItemDto);
      return ok({ data, pageInfo: { nextCursor: result.nextCursor } });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (String(error).includes("Conversation not found")) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      if (String(error).includes("PGRST")) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      return serverError(error);
    }
  };
}

export async function GET(req: NextRequest, context: Params) {
  const handler = createConversationMessagesGetHandler({ requireAuth, apiBootstrap });
  return handler(req, context);
}
