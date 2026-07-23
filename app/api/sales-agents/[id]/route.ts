import { NextRequest, NextResponse } from "next/server";
import { PatchTeamMemberSchema } from "../../../../src/interfaces/api/contracts.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { UpdateTeamMemberWithPasswordUseCase } from "../../../../src/application/usecases/updateTeamMemberWithPassword.js";
import {
  findAuthUserIdByEmail,
  updateAuthUserPasswordById
} from "../../../../src/infrastructure/supabase/authAdminProvision.js";
import { consoleTeamMemberPasswordAuditSink } from "../../../../src/lib/teamMemberPasswordAudit.js";

type Params = { params: Promise<{ id: string }> };

type SalesAgentPatchRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap: typeof apiBootstrap;
  findAuthUserIdByEmail: typeof findAuthUserIdByEmail;
  updateAuthUserPasswordById: typeof updateAuthUserPasswordById;
  recordPasswordAudit: typeof consoleTeamMemberPasswordAuditSink;
};

function handleAuthError(error: unknown): NextResponse | null {
  if (String(error).includes("Unauthorized")) return unauthorized();
  if (String(error).includes("Forbidden")) return forbidden();
  return null;
}

export function createSalesAgentPatchHandler(deps: SalesAgentPatchRouteDeps) {
  return async function PATCH(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["MANAGER", "ADMIN"]);
      const { id: salesAgentId } = await params;
      if (!salesAgentId) return badRequest("Missing sales agent id");
      const body = await req.json();
      const parsed = PatchTeamMemberSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const { newPassword, confirmNewPassword: _confirm, ...patch } = parsed.data;
      if (newPassword && auth.role !== "ADMIN") {
        return forbidden();
      }

      const { salesAgentRepository } = deps.apiBootstrap();
      const useCase = new UpdateTeamMemberWithPasswordUseCase({
        salesAgentRepository,
        findAuthUserIdByEmail: deps.findAuthUserIdByEmail,
        updateAuthUserPasswordById: deps.updateAuthUserPasswordById,
        recordPasswordAudit: deps.recordPasswordAudit
      });
      const data = await useCase.execute({
        auth,
        salesAgentId,
        patch,
        newPassword: newPassword && newPassword.length > 0 ? newPassword : undefined
      });
      return ok({ data });
    } catch (error) {
      const authResp = handleAuthError(error);
      if (authResp) return authResp;
      if (String(error).includes("Team member not found")) {
        return NextResponse.json({ error: "Team member not found" }, { status: 404 });
      }
      if (String(error).includes("Forbidden update team member")) return forbidden();
      if (String(error).includes("Forbidden update team member role")) return forbidden();
      if (String(error).includes("Forbidden update team member password")) return forbidden();
      if (String(error).includes("This team member does not have a login account.")) {
        return badRequest("This team member does not have a login account.");
      }
      if (String(error).includes("Unable to update password")) {
        return NextResponse.json({ error: "Unable to update password" }, { status: 500 });
      }
      if (String(error).includes("Duplicate team member email")) return badRequest("Duplicate team member email");
      if (String(error).includes("Cannot deactivate yourself")) return forbidden("Cannot deactivate yourself");
      if (String(error).includes("Cannot deactivate or demote the last active ADMIN")) {
        return forbidden("Cannot deactivate or demote the last active ADMIN");
      }
      return serverError(error);
    }
  };
}

export const PATCH = createSalesAgentPatchHandler({
  requireAuth,
  apiBootstrap,
  findAuthUserIdByEmail,
  updateAuthUserPasswordById,
  recordPasswordAudit: consoleTeamMemberPasswordAuditSink
});
