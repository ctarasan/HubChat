import { NextRequest, NextResponse } from "next/server";
import { ExecuteRetentionPurgeRunRawPayloadsUseCase, RetentionPurgeExecuteDisabledError } from "../../../../../../src/application/usecases/executeRetentionPurgeRunRawPayloads.js";
import type { AuthContext } from "../../../../../../src/interfaces/api/auth.js";
import { apiBootstrap } from "../../../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../../../src/interfaces/api/auth.js";
import { parseExecuteRetentionPurgeRunBody } from "../../../../../../src/interfaces/api/retentionPurgeExecuteContracts.js";
import { SupabaseRetentionDryRunRepository } from "../../../../../../src/infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";
import { SupabaseRetentionPurgeRunRepository } from "../../../../../../src/infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import { SupabaseRetentionRawPayloadPurgeRepository } from "../../../../../../src/infrastructure/adapters/repositories/supabaseRetentionRawPayloadPurgeRepository.js";

type Params = { params: Promise<{ id: string }> };

export type RetentionPurgeRunExecuteRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap?: typeof apiBootstrap;
  executeRetentionPurgeRun?: (input: {
    auth: AuthContext;
    runId: string;
    batchLimit: number;
  }) => Promise<unknown>;
};

function executeDeps(supabase: ReturnType<typeof apiBootstrap>["supabase"]) {
  return {
    retentionPurgeRunRepository: new SupabaseRetentionPurgeRunRepository(supabase),
    retentionDryRunRepository: new SupabaseRetentionDryRunRepository(supabase),
    rawPayloadPurgeRepository: new SupabaseRetentionRawPayloadPurgeRepository(supabase)
  };
}

export function createRetentionPurgeRunExecutePostHandler(deps: RetentionPurgeRunExecuteRouteDeps) {
  return async function POST(req: NextRequest, { params }: Params) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const { id } = await params;
      if (!id?.trim()) return badRequest("Missing purge run id");

      const body = await req.json().catch(() => ({}));
      const parsedBody = parseExecuteRetentionPurgeRunBody(body);
      if (!parsedBody.ok) return badRequest(parsedBody.message);

      const data = deps.executeRetentionPurgeRun
        ? await deps.executeRetentionPurgeRun({
            auth,
            runId: id,
            batchLimit: parsedBody.value.batchLimit
          })
        : await new ExecuteRetentionPurgeRunRawPayloadsUseCase(
            executeDeps(deps.apiBootstrap!().supabase)
          ).execute({ auth, runId: id, batchLimit: parsedBody.value.batchLimit });

      return ok({ data });
    } catch (error) {
      if (error instanceof RetentionPurgeExecuteDisabledError) {
        return NextResponse.json(
          { error: "Retention purge execute is disabled. Set HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED=true to enable." },
          { status: 503 }
        );
      }
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      if (String(error).includes("Retention purge run not found")) {
        return NextResponse.json({ error: "Retention purge run not found" }, { status: 404 });
      }
      if (
        String(error).includes("Retention purge run is not eligible for execute") ||
        String(error).includes("Retention purge run cannot be cancelled")
      ) {
        return badRequest(String(error instanceof Error ? error.message : error));
      }
      return serverError(error);
    }
  };
}

export const POST = createRetentionPurgeRunExecutePostHandler({ requireAuth, apiBootstrap });
