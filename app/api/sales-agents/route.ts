import { NextRequest, NextResponse } from "next/server";
import { CreateTeamMemberSchema, TeamMemberQuerySchema } from "../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";
import { CreateTeamMemberUseCase } from "../../../src/application/usecases/createTeamMember.js";
import { createAuthUserWithPassword, deleteAuthUserById } from "../../../src/infrastructure/supabase/authAdminProvision.js";

type SalesAgentsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
};

type SalesAgentsPostRouteDeps = SalesAgentsRouteDeps & {
  createAuthUser?: (email: string, password: string) => Promise<string>;
  deleteAuthUser?: (userId: string) => Promise<void>;
};

function isAuthDuplicateEmailError(error: unknown): boolean {
  const s = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    s.includes("already been registered") ||
    s.includes("already registered") ||
    s.includes("user already registered") ||
    s.includes("duplicate")
  );
}

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

export function createSalesAgentsPostHandler(deps: SalesAgentsPostRouteDeps) {
  const provisionAuth = deps.createAuthUser ?? createAuthUserWithPassword;
  const deleteAuth = deps.deleteAuthUser ?? deleteAuthUserById;

  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const body = await req.json();
      const parsed = CreateTeamMemberSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const row = parsed.data;
      const email = row.email.trim();
      const { salesAgentRepository } = deps.apiBootstrap();

      const dup = await salesAgentRepository.findByEmailInTenant(auth.tenantId, email);
      if (dup) {
        return badRequest("Duplicate team member email");
      }

      const wantsAuth = row.createAuthUser === true;
      let newAuthUserId: string | null = null;
      if (wantsAuth) {
        try {
          newAuthUserId = await provisionAuth(email, row.password ?? "");
        } catch (e) {
          if (isAuthDuplicateEmailError(e)) {
            return badRequest("An account with this email already exists.");
          }
          return NextResponse.json(
            { error: "Unable to create login account. Please try again." },
            { status: 500 }
          );
        }
      }

      const useCaseBody = {
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        assignmentEnabled: row.assignmentEnabled,
        assignmentMode: row.assignmentMode,
        maxActiveConversations: row.maxActiveConversations,
        maxActiveLeads: row.maxActiveLeads
      };

      const useCase = new CreateTeamMemberUseCase({ salesAgentRepository });
      try {
        const data = await useCase.execute({ auth, body: useCaseBody });
        return ok({ data });
      } catch (error) {
        if (newAuthUserId) {
          try {
            await deleteAuth(newAuthUserId);
          } catch {
            /* best-effort rollback */
          }
        }
        const authResp = handleAuthError(error);
        if (authResp) return authResp;
        if (String(error).includes("Forbidden create team member role")) return forbidden();
        if (String(error).includes("Duplicate team member email")) return badRequest("Duplicate team member email");
        return serverError(error);
      }
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      return serverError(error);
    }
  };
}

export const GET = createSalesAgentsGetHandler({ requireAuth, apiBootstrap });
export const POST = createSalesAgentsPostHandler({ requireAuth, apiBootstrap });
