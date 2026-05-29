import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { parseLeadsListLimit } from "../../../src/interfaces/api/leadsListPagination.js";
import { parseLeadsListQuery } from "../../../src/interfaces/api/leadsListQuery.js";
import { filterOwnPlatformAccountConversations } from "../../../src/interfaces/api/conversationSelfFilter.js";
import { ListLeadsForMenuUseCase } from "../../../src/application/usecases/listLeadsForMenu.js";

type LeadsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  filterOwnPlatformAccountConversations: typeof filterOwnPlatformAccountConversations;
};

export function createLeadsGetHandler(deps: LeadsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsedQuery = parseLeadsListQuery(qs);
      if (!parsedQuery.ok) return badRequest(parsedQuery.message);

      const limit = parseLeadsListLimit(req.nextUrl.searchParams.get("limit") ?? undefined);
      const { conversationRepository } = deps.apiBootstrap();
      const useCase = new ListLeadsForMenuUseCase({
        conversationRepository,
        filterRows: deps.filterOwnPlatformAccountConversations
      });
      const result = await useCase.execute({
        auth,
        query: parsedQuery.value,
        limit
      });

      return ok(result);
    } catch (error) {
      const status = (error as Error & { httpStatus?: number }).httpStatus;
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (status === 403 || String(error).includes("Forbidden")) return forbidden();
      if (status === 400) return badRequest(error instanceof Error ? error.message : String(error));
      return serverError(error);
    }
  };
}

export const GET = createLeadsGetHandler({
  requireAuth,
  apiBootstrap,
  filterOwnPlatformAccountConversations
});
