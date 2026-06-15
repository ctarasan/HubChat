import { NextRequest } from "next/server";
import { apiBootstrap } from "../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import { readFacebookOAuthResumeCookieValue } from "../../../../../src/lib/facebookOAuthCookie.js";
import { hashFacebookOAuthSecret } from "../../../../../src/lib/facebookOAuthSecurity.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../src/lib/facebookOAuthDisplayState.js";
import {
  badRequest,
  forbidden,
  ok,
  serverError,
  unauthorized
} from "../../../../../src/interfaces/api/http.js";
import { OAuthTransactionNotFoundError } from "../../../../../src/infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.js";

export type FacebookOAuthPagesRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthPagesHandler(
  deps: FacebookOAuthPagesRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const resumeValue = readFacebookOAuthResumeCookieValue(req.headers.get("cookie"));
      const resumeHash = resumeValue ? hashFacebookOAuthSecret(resumeValue) : null;
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.listPages(auth, resumeHash);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (error instanceof OAuthTransactionNotFoundError) {
        return badRequest("OAuth session expired or invalid");
      }
      return serverError(error);
    }
  };
}

export const GET = createFacebookOAuthPagesHandler();
