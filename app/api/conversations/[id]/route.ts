import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { toConversationListItemDto } from "../../../../src/interfaces/api/inboxDtos.js";
import { filterOwnPlatformAccountConversations } from "../../../../src/interfaces/api/conversationSelfFilter.js";
import { resolveConversationListScope } from "../../../../src/interfaces/api/conversationListScope.js";
import { applyConnectionScopeToListRows } from "../../../../src/interfaces/api/connectionScopeList.js";
import {
  attachSourcePostMetadataToConversationRows,
  loadSourcePostMetadataForConversationListRows
} from "../../../../src/application/sourcePost/bridgeConversationListSourcePostMetadata.js";

/**
 * GET /api/conversations/[id] — single conversation in the exact list-item DTO shape.
 *
 * PL-NAV-1: backs the Pipeline → Inbox deep link when the target conversation is
 * outside the currently loaded inbox page. Access rules mirror GET /api/conversations:
 * tenant-scoped, role-gated, SALES restricted to own assigned conversations, and the
 * same self-account/connection-scope filtering. Inaccessible and missing targets both
 * return 404 so the response does not reveal whether the conversation exists.
 */

type Params = { params: Promise<{ id: string }> };

type ConversationByIdRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  filterOwnPlatformAccountConversations: typeof filterOwnPlatformAccountConversations;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notFound(): NextResponse {
  return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
}

export function createConversationByIdGetHandler(deps: ConversationByIdRouteDeps) {
  return async function GET(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const tenantId = auth.tenantId;
      const { id } = await params;
      const conversationId = (id ?? "").trim();
      if (!UUID_RE.test(conversationId)) {
        return badRequest("Invalid conversation id");
      }

      const scopeResolved = resolveConversationListScope(auth, undefined);
      if (!scopeResolved.ok) {
        return forbidden(scopeResolved.message);
      }

      const bootstrap = deps.apiBootstrap();
      const { conversationRepository } = bootstrap;
      const findInboxListItemById = conversationRepository.findInboxListItemById?.bind(conversationRepository);
      if (!findInboxListItemById) return notFound();

      const row = await findInboxListItemById(tenantId, conversationId);
      if (!row) return notFound();

      if (scopeResolved.filter.kind === "assigned_to_agent") {
        const assignedAgentId = String((row as { assigned_agent_id?: unknown }).assigned_agent_id ?? "").trim();
        if (assignedAgentId !== scopeResolved.filter.agentId) return notFound();
      }

      const selfFiltered = deps.filterOwnPlatformAccountConversations([row]);
      if (selfFiltered.length === 0) return notFound();

      const scoped = await applyConnectionScopeToListRows({
        tenantId,
        auth,
        rows: selfFiltered as Record<string, unknown>[],
        repositories: {
          channelConnectionRepository: bootstrap.channelConnectionRepository,
          channelSettingRepository: bootstrap.channelSettingRepository
        }
      });
      if (scoped.rows.length === 0) return notFound();

      const sourcePostMetadataByConversationId = await loadSourcePostMetadataForConversationListRows({
        tenantId,
        rows: scoped.rows,
        messageRepository: bootstrap.messageRepository
      });
      const rowsWithSourcePostMetadata = attachSourcePostMetadataToConversationRows(
        scoped.rows,
        sourcePostMetadataByConversationId
      );

      return ok({
        data: toConversationListItemDto(rowsWithSourcePostMetadata[0]!, {
          connectionScopeContext: scoped.scopeContext
        })
      });
    } catch (error) {
      const status = (error as Error & { httpStatus?: number }).httpStatus;
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (status === 403 || String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createConversationByIdGetHandler({
  requireAuth,
  apiBootstrap,
  filterOwnPlatformAccountConversations
});
