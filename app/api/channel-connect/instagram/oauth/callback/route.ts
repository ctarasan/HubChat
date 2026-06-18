import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { createInstagramOAuthConnectServiceFromBootstrap } from "../../../../../../src/interfaces/api/instagramOAuthRouteFactory.js";
import { assertInstagramOAuthRedirectUrlSafe } from "../../../../../../src/lib/instagramOAuthRedirect.js";
import { serverError } from "../../../../../../src/interfaces/api/http.js";

export type InstagramOAuthCallbackRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
};

export function createInstagramOAuthCallbackHandler(
  deps: InstagramOAuthCallbackRouteDeps = { apiBootstrap }
) {
  return async function GET(req: NextRequest) {
    try {
      const service = createInstagramOAuthConnectServiceFromBootstrap(deps.apiBootstrap);
      const url = new URL(req.url);
      const result = await service.handleCallback({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        error: url.searchParams.get("error"),
        error_reason: url.searchParams.get("error_reason"),
        error_description: url.searchParams.get("error_description")
      });

      assertInstagramOAuthRedirectUrlSafe(result.redirectUrl);
      return NextResponse.redirect(result.redirectUrl, 303);
    } catch (error) {
      return serverError(error);
    }
  };
}

export const GET = createInstagramOAuthCallbackHandler();
