import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { NextResponse } from "next/server";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { parseLimit } from "../../../src/interfaces/api/pagination.js";
import {
  ListMarketingEventsUseCase,
  MarketingEventsListQuerySchema
} from "../../../src/application/usecases/listMarketingEvents.js";

type MarketingEventsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

export function createMarketingEventsGetHandler(deps: MarketingEventsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = MarketingEventsListQuerySchema.safeParse(qs);
      if (!parsed.success) return badRequest(parsed.error.message);

      const b = deps.apiBootstrap();
      const useCase = new ListMarketingEventsUseCase({
        marketingEventRepository: b.marketingEventRepository,
        conversationRepository: b.conversationRepository,
        leadRepository: b.leadRepository
      });

      const result = await useCase.execute({
        auth,
        query: {
          ...parsed.data,
          limit: String(parseLimit(parsed.data.limit))
        }
      });

      return ok({ data: result.items, pageInfo: result.pageInfo });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (String(error).includes("not found")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return serverError(error);
    }
  };
}

export const GET = createMarketingEventsGetHandler({ requireAuth, apiBootstrap });
