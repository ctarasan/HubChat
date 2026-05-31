import { NextRequest } from "next/server";
import { GetAnalyticsOverviewUseCase, createGetAnalyticsOverviewUseCaseFromSupabase } from "../../../../src/application/usecases/getAnalyticsOverview.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { parseAnalyticsOverviewQuery } from "../../../../src/interfaces/api/analyticsOverviewContracts.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

export type AnalyticsOverviewRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
  createUseCase?: (bootstrap: ReturnType<typeof apiBootstrap>) => GetAnalyticsOverviewUseCase;
};

export function createAnalyticsOverviewGetHandler(
  deps: AnalyticsOverviewRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = parseAnalyticsOverviewQuery(qs);
      if (!parsed.ok) return badRequest(parsed.message);

      const bootstrap = deps.apiBootstrap();
      const useCase =
        deps.createUseCase?.(bootstrap) ??
        createGetAnalyticsOverviewUseCaseFromSupabase(
          bootstrap.supabase as unknown as Parameters<
            typeof createGetAnalyticsOverviewUseCaseFromSupabase
          >[0],
          bootstrap.slaPolicyRepository
        );

      const data = await useCase.execute({
        tenantId: auth.tenantId,
        range: parsed.range
      });

      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createAnalyticsOverviewGetHandler();
