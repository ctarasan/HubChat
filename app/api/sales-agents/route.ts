import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";

type SalesAgentsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

export function createSalesAgentsGetHandler(deps: SalesAgentsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const { salesAgentRepository } = deps.apiBootstrap();
      const items = await salesAgentRepository.listActiveByTenant(auth.tenantId);
      return ok({ data: items });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createSalesAgentsGetHandler({ requireAuth, apiBootstrap });
