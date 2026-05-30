import { NextRequest, NextResponse } from "next/server";
import { CancelRetentionPurgeRunUseCase } from "../../../../../../src/application/usecases/cancelRetentionPurgeRun.js";
import type { AuthContext } from "../../../../../../src/interfaces/api/auth.js";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../../src/interfaces/api/auth.js";
import { SupabaseRetentionPurgeRunRepository } from "../../../../../../src/infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";

type Params = { params: Promise<{ id: string }> };

export type RetentionPurgeRunCancelRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap?: typeof apiBootstrap;
  cancelRetentionPurgeRun?: (input: { auth: AuthContext; runId: string }) => Promise<unknown>;
};

export function createRetentionPurgeRunCancelPostHandler(deps: RetentionPurgeRunCancelRouteDeps) {
  return async function POST(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const { id } = await params;
      if (!id?.trim()) return badRequest("Missing purge run id");

      const data = deps.cancelRetentionPurgeRun
        ? await deps.cancelRetentionPurgeRun({ auth, runId: id })
        : await new CancelRetentionPurgeRunUseCase({
            retentionPurgeRunRepository: new SupabaseRetentionPurgeRunRepository(
              deps.apiBootstrap!().supabase
            )
          }).execute({ auth, runId: id });

      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (String(error).includes("Retention purge run not found")) {
        return NextResponse.json({ error: "Retention purge run not found" }, { status: 404 });
      }
      if (String(error).includes("Retention purge run cannot be cancelled")) {
        return badRequest("Retention purge run cannot be cancelled");
      }
      return serverError(error);
    }
  };
}

export const POST = createRetentionPurgeRunCancelPostHandler({ requireAuth, apiBootstrap });
