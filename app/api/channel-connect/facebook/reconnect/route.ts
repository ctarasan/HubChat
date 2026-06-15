import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../src/lib/facebookOAuthDisplayState.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";

export type FacebookOAuthReconnectRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthReconnectHandler(
  deps: FacebookOAuthReconnectRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.startReconnect(auth);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("not available") ||
        message.includes("not found") ||
        message.includes("not established")
      ) {
        return badRequest(message);
      }
      return serverError(error);
    }
  };
}

export const POST = createFacebookOAuthReconnectHandler();
