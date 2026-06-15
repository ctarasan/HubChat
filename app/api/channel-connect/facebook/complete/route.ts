import { NextRequest } from "next/server";
import { z } from "zod";
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

const CompleteBodySchema = z
  .object({
    pageId: z.string().min(1)
  })
  .strict();

export type FacebookOAuthCompleteRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthCompleteHandler(
  deps: FacebookOAuthCompleteRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const body = await req.json();
      const parsed = CompleteBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const resumeValue = readFacebookOAuthResumeCookieValue(req.headers.get("cookie"));
      const resumeHash = resumeValue ? hashFacebookOAuthSecret(resumeValue) : null;
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.complete(auth, resumeHash, parsed.data.pageId);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (error instanceof OAuthTransactionNotFoundError) {
        return badRequest("OAuth session expired or invalid");
      }
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("pageId") ||
        message.includes("Page") ||
        message.includes("permissions")
      ) {
        return badRequest(message);
      }
      return serverError(error);
    }
  };
}

export const POST = createFacebookOAuthCompleteHandler();
