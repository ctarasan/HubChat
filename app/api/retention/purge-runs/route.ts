import { NextRequest, NextResponse } from "next/server";
import { CreateRetentionPurgeRunSnapshotUseCase } from "../../../../src/application/usecases/createRetentionPurgeRunSnapshot.js";
import { ListRetentionPurgeRunsUseCase } from "../../../../src/application/usecases/listRetentionPurgeRuns.js";
import type { AuthContext } from "../../../../src/interfaces/api/auth.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { badRequest, forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";
import { parseRetentionPurgeRunsLimit } from "../../../../src/interfaces/api/retentionPurgeRunsQuery.js";
import { SupabaseRetentionDryRunRepository } from "../../../../src/infrastructure/adapters/repositories/supabaseRetentionDryRunRepository.js";
import { SupabaseRetentionPurgeRunRepository } from "../../../../src/infrastructure/adapters/repositories/supabaseRetentionPurgeRunRepository.js";
import { parseCreateRetentionPurgeRunBody } from "../../../../src/interfaces/api/retentionPurgeRunsContracts.js";

export type RetentionPurgeRunsRouteDeps = {
  requireAuth: typeof requireAuth;
  apiBootstrap?: typeof apiBootstrap;
  listRetentionPurgeRuns?: (input: { auth: AuthContext; limit: number }) => Promise<unknown[]>;
  createRetentionPurgeRunSnapshot?: (input: {
    auth: AuthContext;
    notes?: string | null;
  }) => Promise<unknown>;
};

function purgeRunRepository(supabase: ReturnType<typeof apiBootstrap>["supabase"]) {
  return new SupabaseRetentionPurgeRunRepository(supabase);
}

function dryRunAndPurgeRepositories(supabase: ReturnType<typeof apiBootstrap>["supabase"]) {
  return {
    retentionDryRunRepository: new SupabaseRetentionDryRunRepository(supabase),
    retentionPurgeRunRepository: purgeRunRepository(supabase)
  };
}

export function createRetentionPurgeRunsGetHandler(deps: RetentionPurgeRunsRouteDeps) {
  return async function GET(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const limit = parseRetentionPurgeRunsLimit(req.nextUrl.searchParams.get("limit") ?? undefined);
      const data = deps.listRetentionPurgeRuns
        ? await deps.listRetentionPurgeRuns({ auth, limit })
        : await new ListRetentionPurgeRunsUseCase({
            retentionPurgeRunRepository: purgeRunRepository(deps.apiBootstrap!().supabase)
          }).execute({ auth, limit });
      return ok({ data });
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export function createRetentionPurgeRunsPostHandler(deps: RetentionPurgeRunsRouteDeps) {
  return async function POST(req: NextRequest) {
    try {
      const auth = await deps.requireAuth(req, ["ADMIN"]);
      const body = await req.json().catch(() => ({}));
      const parsedBody = parseCreateRetentionPurgeRunBody(body);
      if (!parsedBody.ok) return badRequest(parsedBody.message);

      const data = deps.createRetentionPurgeRunSnapshot
        ? await deps.createRetentionPurgeRunSnapshot({
            auth,
            notes: parsedBody.value.notes
          })
        : await new CreateRetentionPurgeRunSnapshotUseCase(
            dryRunAndPurgeRepositories(deps.apiBootstrap!().supabase)
          ).execute({ auth, notes: parsedBody.value.notes });

      return ok({ data }, 201);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createRetentionPurgeRunsGetHandler({ requireAuth, apiBootstrap });
export const POST = createRetentionPurgeRunsPostHandler({ requireAuth, apiBootstrap });
