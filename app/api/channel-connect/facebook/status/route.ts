import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../src/lib/facebookOAuthDisplayState.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";

export type FacebookOAuthStatusRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthStatusHandler(
  deps: FacebookOAuthStatusRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.getStatus(auth);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createFacebookOAuthStatusHandler();
