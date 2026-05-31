import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { parseLimit } from "../../../src/interfaces/api/pagination.js";
import { toConversationListItemDto } from "../../../src/interfaces/api/inboxDtos.js";
import { filterOwnPlatformAccountConversations } from "../../../src/interfaces/api/conversationSelfFilter.js";
import { resolveConversationListScope, type ConversationListAssignmentFilter } from "../../../src/interfaces/api/conversationListScope.js";
import { parseConversationsListQuery } from "../../../src/interfaces/api/conversationListInboxFilters.js";
import { buildApiListDiagnostic } from "../../../src/lib/apiObservabilityContext.js";
import { buildListResponseCostReport } from "../../../src/lib/responseCostEstimate.js";
import {
  loadInboxFilterClockForTenant
} from "../../../src/application/sla/resolveInboxFilterClock.js";

type LoadInboxFilterClockForTenantFn = typeof loadInboxFilterClockForTenant;

function toRepoAssignmentFilter(
  filter: ConversationListAssignmentFilter
): "none" | "unassigned" | "team" | { assignedToAgentId: string } {
  if (filter.kind === "none") return "none";
  if (filter.kind === "unassigned") return "unassigned";
  if (filter.kind === "team") return "team";
  return { assignedToAgentId: filter.agentId };
}

type ConversationsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  filterOwnPlatformAccountConversations: typeof filterOwnPlatformAccountConversations;
  loadInboxFilterClockForTenant?: LoadInboxFilterClockForTenantFn;
};

export function createConversationsGetHandler(deps: ConversationsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const tenantId = auth.tenantId;
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsedQuery = parseConversationsListQuery(qs);
      if (!parsedQuery.ok) return badRequest(parsedQuery.message);

      const scopeResolved = resolveConversationListScope(auth, parsedQuery.value.scope);
      if (!scopeResolved.ok) {
        return forbidden(scopeResolved.message);
      }

      const loadClock = deps.loadInboxFilterClockForTenant ?? loadInboxFilterClockForTenant;
      const inboxFilterClock = await loadClock(tenantId);

      const { conversationRepository } = deps.apiBootstrap();
      const result = await conversationRepository.list({
        tenantId,
        status: parsedQuery.value.conversationStatus,
        channel: parsedQuery.value.channel,
        assignedAgentId: parsedQuery.value.assignedAgentId,
        assignmentFilter: toRepoAssignmentFilter(scopeResolved.filter),
        inboxFilters: parsedQuery.value.inboxFilters,
        inboxFilterClock,
        cursor: parsedQuery.value.cursor,
        limit: parseLimit(parsedQuery.value.limit)
      });

      const safeRows = deps.filterOwnPlatformAccountConversations(result.items);
      const safeItems = safeRows.map((row) => toConversationListItemDto(row as Record<string, unknown>));
      const nextCursor = result.nextCursor;
      const responseBody = {
        data: safeItems,
        pageInfo: {
          nextCursor,
          hasNextPage: nextCursor != null
        }
      };
      if (process.env.HUBCHAT_DIAGNOSTIC_LOGS === "true") {
        const cost = buildListResponseCostReport({
          route: "hubchat.conversations.list",
          itemCount: safeItems.length,
          limit: parseLimit(parsedQuery.value.limit),
          hasCursor: Boolean(parsedQuery.value.cursor),
          responseBody
        });
        console.info(
          JSON.stringify(
            buildApiListDiagnostic({
              route: "hubchat.conversations.list",
              tenantId,
              limit: cost.limit,
              hasCursor: cost.hasCursor,
              rawRowCount: result.items.length,
              responseRowCount: safeItems.length,
              estimatedUtf8Bytes: cost.estimatedUtf8Bytes,
              payloadTier: cost.tier,
              filters: {
                conversationStatus: parsedQuery.value.conversationStatus ?? null,
                channel: parsedQuery.value.channel ?? null,
                scope: parsedQuery.value.scope ?? null,
                assignedAgentId: parsedQuery.value.assignedAgentId ?? null,
                leadManagementStatus: parsedQuery.value.inboxFilters?.leadManagementStatus ?? null,
                followUp: parsedQuery.value.inboxFilters?.followUp ?? null,
                sla: parsedQuery.value.inboxFilters?.sla ?? null,
                waiting: parsedQuery.value.inboxFilters?.waiting ?? null
              }
            })
          )
        );
      }
      return ok(responseBody);
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
