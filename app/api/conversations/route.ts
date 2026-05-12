import { NextRequest } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { parseLimit } from "../../../src/interfaces/api/pagination.js";
import { filterOwnPlatformAccountConversations } from "../../../src/interfaces/api/conversationSelfFilter.js";
import { resolveConversationListScope, type ConversationListAssignmentFilter } from "../../../src/interfaces/api/conversationListScope.js";

const QuerySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "TIKTOK", "SHOPEE", "LAZADA"]).optional(),
  assignedSalesId: z.string().uuid().optional(),
  scope: z.enum(["all", "unassigned", "assigned_to_me"]).optional(),
  cursor: z.string().optional(),
  limit: z.string().optional()
});

function toRepoAssignmentFilter(filter: ConversationListAssignmentFilter): "none" | "unassigned" | { assignedToAgentId: string } {
  if (filter.kind === "none") return "none";
  if (filter.kind === "unassigned") return "unassigned";
  return { assignedToAgentId: filter.agentId };
}

type ConversationsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  filterOwnPlatformAccountConversations: typeof filterOwnPlatformAccountConversations;
};

export function createConversationsGetHandler(deps: ConversationsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const tenantId = auth.tenantId;
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = QuerySchema.safeParse(qs);
      if (!parsed.success) return badRequest(parsed.error.message);

      const scopeResolved = resolveConversationListScope(auth, parsed.data.scope);
      if (!scopeResolved.ok) {
        return forbidden(scopeResolved.message);
      }

      const { conversationRepository } = deps.apiBootstrap();
      const result = await conversationRepository.list({
        tenantId,
        status: parsed.data.status,
        channel: parsed.data.channel,
        assignedSalesId: parsed.data.assignedSalesId,
        assignmentFilter: toRepoAssignmentFilter(scopeResolved.filter),
        cursor: parsed.data.cursor,
        limit: parseLimit(parsed.data.limit)
      });

      const safeItems = deps.filterOwnPlatformAccountConversations(result.items);
      if (process.env.HUBCHAT_DIAGNOSTIC_LOGS === "true") {
        console.info(
          JSON.stringify({
            diag: "hubchat.conversations.list",
            tenantId,
            status: parsed.data.status ?? null,
            channel: parsed.data.channel ?? null,
            scope: parsed.data.scope ?? null,
            rawRowCount: result.items.length,
            filteredRowCount: safeItems.length
          })
        );
      }
      return ok({ data: safeItems, pageInfo: { nextCursor: result.nextCursor } });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createConversationsGetHandler({
  requireAuth,
  apiBootstrap,
  filterOwnPlatformAccountConversations
});
