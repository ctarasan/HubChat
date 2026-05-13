import { NextRequest, NextResponse } from "next/server";
import { CreateTeamMemberSchema, TeamMemberQuerySchema } from "../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { CreateTeamMemberUseCase } from "../../../src/application/usecases/createTeamMember.js";

type SalesAgentsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

function handleAuthError(error: unknown): NextResponse | null {
  if (String(error).includes("Unauthorized")) return unauthorized();
  if (String(error).includes("Forbidden")) return forbidden();
  return null;
}

export function createSalesAgentsGetHandler(deps: SalesAgentsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const qs = Object.fromEntries(req.nextUrl.searchParams.entries());
      const parsed = TeamMemberQuerySchema.safeParse(qs);
      if (!parsed.success) return badRequest(parsed.error.message);
      const q = parsed.data;
      const useFullTeamMemberList =
        q.includeInactive ||
        Boolean(q.role) ||
        Boolean(q.status) ||
        Boolean(q.assignmentMode) ||
        Boolean(q.q && q.q.trim().length > 0);

      const { salesAgentRepository } = deps.apiBootstrap();
      if (!useFullTeamMemberList) {
        const items = await salesAgentRepository.listActiveByTenant(auth.tenantId);
        return ok({ data: items });
      }
      const items = await salesAgentRepository.listByTenant({
        tenantId: auth.tenantId,
        includeInactive: q.includeInactive,
        role: q.role,
        status: q.status,
        assignmentMode: q.assignmentMode,
        search: q.q?.trim() || undefined
      });
      return ok({ data: items });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export function createSalesAgentsPostHandler(deps: SalesAgentsRouteDeps) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const body = await req.json();
      const parsed = CreateTeamMemberSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const { salesAgentRepository } = deps.apiBootstrap();
      const useCase = new CreateTeamMemberUseCase({ salesAgentRepository });
      const data = await useCase.execute({ auth, body: parsed.data });
      return ok({ data });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      if (String(error).includes("Forbidden create team member role")) return forbidden();
      if (String(error).includes("Duplicate team member email")) return badRequest("Duplicate team member email");
      return serverError(error);
    }
  };
}

export const GET = createSalesAgentsGetHandler({ requireAuth, apiBootstrap });
export const POST = createSalesAgentsPostHandler({ requireAuth, apiBootstrap });
