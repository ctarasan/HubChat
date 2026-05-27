import { NextRequest, NextResponse } from "next/server";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../src/interfaces/api/http.js";
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
      if (String(error).includes("Missing x-tenant-id header")) {
        return badRequest("Tenant id is required.");
      }
      if (
        String(error).includes("Forbidden: inactive profile") ||
        String(error).includes("Forbidden: no active sales agent profile")
      ) {
        return forbidden("Your account is not active in this workspace. Please contact your administrator.");
      }
      if (String(error).includes("Forbidden")) return forbidden();
      if (String(error).includes("SalesAgentLookupFailed")) {
        return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
      }
      return serverError(error);
    }
  };
}

export const GET = createMeGetHandler({ requireAuth });
