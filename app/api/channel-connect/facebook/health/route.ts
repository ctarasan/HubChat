import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../src/lib/facebookOAuthDisplayState.js";
import { forbidden, notImplemented, serverError, unauthorized } from "../../../../../src/interfaces/api/http.js";

export type FacebookOAuthHealthRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthHealthHandler(
  deps: FacebookOAuthHealthRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const { channelConnectionRepository } = deps.apiBootstrap();
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const connection = await channelConnectionRepository.findByTenantAndProvider(
        auth.tenantId,
        "FACEBOOK"
      );
      const data = service.buildDeferredHealthResponse(connection);
      assertFacebookOAuthPublicDtoSafe({ data });
      return notImplemented({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const POST = createFacebookOAuthHealthHandler();
