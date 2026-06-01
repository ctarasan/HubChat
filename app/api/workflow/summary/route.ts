import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { parseWorkflowSummaryQuery } from "../../../../src/interfaces/api/workflowContracts.js";
import {
  createGetWorkflowSummaryUseCaseFromSupabase,
  GetWorkflowSummaryUseCase
} from "../../../../src/application/usecases/getWorkflowSummary.js";

export type WorkflowSummaryRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  createUseCase?: (bootstrap: ReturnType<typeof apiBootstrap>) => GetWorkflowSummaryUseCase;
};

export function createWorkflowSummaryGetHandler(
  deps: WorkflowSummaryRouteDeps = { requireAuth, apiBootstrap }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = parseWorkflowSummaryQuery(qs);
      if (!parsed.ok) return badRequest(parsed.message);

      const bootstrap = deps.apiBootstrap();
      const useCase =
        deps.createUseCase?.(bootstrap) ??
        createGetWorkflowSummaryUseCaseFromSupabase(
          bootstrap.supabase as unknown as Parameters<typeof createGetWorkflowSummaryUseCaseFromSupabase>[0]
        );

      const data = await useCase.execute({ auth, query: parsed.value });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createWorkflowSummaryGetHandler();
