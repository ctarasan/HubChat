import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { parseWorkflowItemsQuery } from "../../../../src/interfaces/api/workflowContracts.js";
import {
  createListWorkflowItemsUseCaseWithConnectionScope,
  ListWorkflowItemsUseCase
} from "../../../../src/application/usecases/listWorkflowItems.js";

export type WorkflowItemsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  createUseCase?: (bootstrap: ReturnType<typeof apiBootstrap>) => ListWorkflowItemsUseCase;
};

export function createWorkflowItemsGetHandler(
  deps: WorkflowItemsRouteDeps = { requireAuth, apiBootstrap }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = parseWorkflowItemsQuery(qs);
      if (!parsed.ok) return badRequest(parsed.message);

      const bootstrap = deps.apiBootstrap();
      const useCase =
        deps.createUseCase?.(bootstrap) ??
        createListWorkflowItemsUseCaseWithConnectionScope(
          bootstrap.supabase as unknown as Parameters<typeof createListWorkflowItemsUseCaseWithConnectionScope>[0],
          {
            channelConnectionRepository: bootstrap.channelConnectionRepository,
            channelSettingRepository: bootstrap.channelSettingRepository
          }
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

export const GET = createWorkflowItemsGetHandler();
