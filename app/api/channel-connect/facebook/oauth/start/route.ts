import { NextRequest } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../../src/interfaces/api/auth.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import {
  badRequest,
  forbidden,
  ok,
  serverError,
  unauthorized
} from "../../../../../../src/interfaces/api/http.js";
import { assertFacebookOAuthPublicDtoSafe } from "../../../../../../src/lib/facebookOAuthDisplayState.js";

const StartBodySchema = z
  .object({
    reconnect: z.boolean().optional()
  })
  .strict();

export type FacebookOAuthStartRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createFacebookOAuthStartHandler(
  deps: FacebookOAuthStartRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const body = await req.json().catch(() => ({}));
      const parsed = StartBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);
      if (parsed.data.reconnect) {
        return badRequest("Reconnect is not yet available in this release");
      }

      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.startOAuth(auth);
      assertFacebookOAuthPublicDtoSafe({ data });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not available") || message.includes("already established")) {
        return badRequest(message);
      }
      return serverError(error);
    }
  };
}

export const POST = createFacebookOAuthStartHandler();
