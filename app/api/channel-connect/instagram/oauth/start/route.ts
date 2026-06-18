import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { requireAuth } from "../../../../../../src/interfaces/api/auth.js";
import { createInstagramOAuthConnectServiceFromBootstrap } from "../../../../../../src/interfaces/api/instagramOAuthRouteFactory.js";
import { okNoStore } from "../../../../../../src/interfaces/api/instagramOAuthHttp.js";
import {
  badRequest,
  forbidden,
  serverError,
  unauthorized
} from "../../../../../../src/interfaces/api/http.js";
import { InstagramOAuthConnectError } from "../../../../../../src/lib/instagramOAuthConnectErrors.js";
import { assertInstagramOAuthStartResponseSafe } from "../../../../../../src/lib/instagramOAuthRedirect.js";

const StartBodySchema = z
  .object({
    channelConnectionId: z.string().uuid(),
    returnTo: z.literal("CHANNEL_SETTINGS").optional()
  })
  .strict();

export type InstagramOAuthStartRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

export function createInstagramOAuthStartHandler(
  deps: InstagramOAuthStartRouteDeps = { apiBootstrap, requireAuth }
) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const body = await req.json().catch(() => ({}));
      const parsed = StartBodySchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.message);

      const service = createInstagramOAuthConnectServiceFromBootstrap(deps.apiBootstrap);
      const data = await service.startOAuth(auth, parsed.data);
      assertInstagramOAuthStartResponseSafe({ data });
      return okNoStore({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (error instanceof InstagramOAuthConnectError) {
        if (error.httpStatus === 503) {
          return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
        }
        if (error.httpStatus === 404) {
          return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
        }
        if (error.httpStatus === 409) {
          return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
        }
        return badRequest(error.message);
      }
      return serverError(error);
    }
  };
}

export const POST = createInstagramOAuthStartHandler();
