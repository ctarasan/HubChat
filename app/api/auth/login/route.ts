import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchPasswordAccessToken } from "../../../../src/infrastructure/supabase/passwordGrant.js";
import { listActiveTenantIdsForEmail } from "../../../../src/infrastructure/supabase/resolveTeamMemberTenants.js";
import { conflict, forbidden, ok, unauthorized } from "../../../../src/interfaces/api/http.js";

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const NO_WORKSPACE =
  "Your account is not active in this workspace. Please contact your administrator.";
const MULTI_WORKSPACE = "This account is linked to more than one workspace. Please contact your administrator.";

export type AuthLoginPostDeps = {
  fetchPasswordAccessToken: typeof fetchPasswordAccessToken;
  listActiveTenantIdsForEmail: typeof listActiveTenantIdsForEmail;
};

export function createAuthLoginPostHandler(deps: AuthLoginPostDeps) {
  return async function POST(req: NextRequest) {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = loginBodySchema.safeParse(raw);
      if (!parsed.success) {
        return unauthorized("Invalid email or password.");
      }
      const { email, password } = parsed.data;
      let accessToken: string;
      try {
        accessToken = await deps.fetchPasswordAccessToken(email, password);
      } catch {
        return unauthorized("Invalid email or password.");
      }

      const tenantIds = await deps.listActiveTenantIdsForEmail(email);
      if (tenantIds.length === 0) {
        return forbidden(NO_WORKSPACE);
      }
      if (tenantIds.length > 1) {
        return conflict({ error: MULTI_WORKSPACE, code: "MULTIPLE_TENANTS" });
      }

      const baseUrl = new URL(req.url).origin;
      return ok({ accessToken, tenantId: tenantIds[0], baseUrl });
    } catch {
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
  };
}

export const POST = createAuthLoginPostHandler({
  fetchPasswordAccessToken,
  listActiveTenantIdsForEmail
});
