import { NextRequest } from "next/server";
import { RunRetentionDryRunUseCase } from "../../../../src/application/usecases/runRetentionDryRun.js";
import type { RetentionDryRunReportDto } from "../../../../src/lib/retentionDryRun.js";
import type { AuthContext } from "../../../../src/interfaces/api/auth.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { SupabaseRetentionDryRunRepository } from "../../../../src/infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";

export type RetentionDryRunRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap?: typeof apiBootstrap;
  runRetentionDryRun?: (auth: AuthContext) => Promise<RetentionDryRunReportDto>;
};

export function createRetentionDryRunGetHandler(deps: RetentionDryRunRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const data = deps.runRetentionDryRun
        ? await deps.runRetentionDryRun(auth)
        : await new RunRetentionDryRunUseCase({
            retentionDryRunRepository: new SupabaseRetentionDryRunRepository(
              deps.apiBootstrap!().supabase
            )
          }).execute({ auth });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createRetentionDryRunGetHandler({ requireAuth, apiBootstrap });
