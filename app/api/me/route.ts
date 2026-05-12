import { NextRequest } from "next/server";
import { ok, serverError, unauthorized, forbidden } from "../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../src/interfaces/api/auth.js";

type MeRouteDeps = {
  requireAuth: typeof requireAuth;
};

export function createMeGetHandler(deps: MeRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["SALES", "MANAGER", "ADMIN"]);
      return ok({
        data: {
          tenantId: auth.tenantId,
          userId: auth.userId,
          email: auth.email,
          role: auth.role,
          salesAgentId: auth.salesAgentId
        }
      });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createMeGetHandler({ requireAuth });
