import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { createFacebookOAuthServiceFromBootstrap } from "../../../../../../src/interfaces/api/facebookOAuthRouteFactory.js";
import {
  buildFacebookOAuthResumeClearCookieHeader,
  buildFacebookOAuthResumeSetCookieHeader
} from "../../../../../../src/lib/facebookOAuthCookie.js";
import { serverError } from "../../../../../../src/interfaces/api/http.js";

export type FacebookOAuthCallbackRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
};

export function createFacebookOAuthCallbackHandler(
  deps: FacebookOAuthCallbackRouteDeps = { apiBootstrap }
) {
  return async function GET(req: NextRequest) {
    try {
      const service = createFacebookOAuthServiceFromBootstrap(deps.apiBootstrap);
      const url = new URL(req.url);
      const result = await service.handleCallback({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        error: url.searchParams.get("error"),
        error_reason: url.searchParams.get("error_reason")
      });

      const secure = url.protocol === "https:";
      const response = NextResponse.redirect(result.redirectUrl, 302);
      if (result.resumeCookieValue) {
        response.headers.append(
          "Set-Cookie",
          buildFacebookOAuthResumeSetCookieHeader(result.resumeCookieValue, { secure })
        );
      }
      if (result.clearCookie) {
        response.headers.append(
          "Set-Cookie",
          buildFacebookOAuthResumeClearCookieHeader({ secure })
        );
      }

      const location = response.headers.get("location") ?? "";
      if (/[?&](code|state|access_token)=/i.test(location)) {
        throw new Error("Unsafe OAuth redirect");
      }
      return response;
    } catch (error) {
      return serverError(error);
    }
  };
}

export const GET = createFacebookOAuthCallbackHandler();
