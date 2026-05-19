import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { parseMessageLimit } from "../../../../../src/interfaces/api/pagination.js";
import { toMessageListItemDto } from "../../../../../src/interfaces/api/inboxDtos.js";
import { canReplyToConversation } from "../../../../../src/application/authorization/conversationPermissions.js";
import { serializeError } from "../../../../../src/lib/serializeError.js";

type Params = { params: Promise<{ id: string }> };

type MessagesRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(id: string, label: string): void {
  if (!UUID_RE.test(id.trim())) {
    throw new Error(`Invalid ${label}`);
  }
}

export function parseIncludeConversationIds(raw: string | null, primaryId: string): string[] {
  assertUuid(primaryId, "conversation id");
  const ids = new Set<string>([primaryId.trim()]);
  if (!raw?.trim()) return [...ids];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id) continue;
    assertUuid(id, "includeConversationIds");
    ids.add(id);
  }
  return [...ids];
}

function mapMessagesRouteError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Unauthorized")) return unauthorized();
  if (message.includes("Forbidden")) return forbidden();
  if (message.includes("Conversation not found")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (message.includes("Invalid conversation id") || message.includes("Invalid includeConversationIds")) {
    return badRequest(message);
  }
  const serialized = serializeError(error);
  const code = serialized.code ?? "";
  if (code.startsWith("PGRST") || code === "42703" || code === "22P02") {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (message.includes("PGRST")) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return serverError(error);
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

      const data = result.items.map((item) => toMessageListItemDto(item));
      return ok({ data, pageInfo: { nextCursor: result.nextCursor } });
    } catch (error) {
      return mapMessagesRouteError(error);
    }
  };
}

export async function GET(req: NextRequest, context: Params) {
  const handler = createConversationMessagesGetHandler({ requireAuth, apiBootstrap });
  return handler(req, context);
}
