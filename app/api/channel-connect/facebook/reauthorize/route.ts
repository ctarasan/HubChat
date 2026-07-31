import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../src/lib/facebookOAuthDisplayState.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";

export type FacebookOAuthReauthorizeRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthReauthorizeHandler(
  deps: FacebookOAuthReauthorizeRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.startReauthorize(auth);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("not available") ||
        message.includes("not found") ||
        message.includes("not established") ||
        message.includes("not ready") ||
        message.includes("required for re-authorization") ||
        message.includes("Provider mismatch")
      ) {
        return badRequest(message);
      }
      return serverError(error);
    }
  };
}

export const POST = createFacebookOAuthReauthorizeHandler();
