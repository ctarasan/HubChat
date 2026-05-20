import { NextRequest } from "next/server";
import { DEFAULT_RUNTIME_HEALTH_THRESHOLDS } from "../../../../src/domain/observability.js";
import type { OpsRuntimeResponseDto } from "../../../../src/domain/observability.js";
import {
  buildQueueOutboxRuntimeSnapshot,
  classifyQueueOutboxHealth,
  firstRpcRow
} from "../../../../src/lib/runtimeStatsSnapshot.js";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { forbidden, ok, serverError, unauthorized } from "../../../../src/interfaces/api/http.js";
import { requireAuth } from "../../../../src/interfaces/api/auth.js";

export type OpsRuntimeRouteDeps = {
  apiBootstrap: typeof apiBootstrap;
  requireAuth: typeof requireAuth;
};

/**
 * Read-only queue/outbox runtime stats for ADMIN ops.
 * Uses existing get_queue_runtime_stats / get_outbox_runtime_stats RPCs (no schema change).
 */
export function createOpsRuntimeGetHandler(deps: OpsRuntimeRouteDeps = { apiBootstrap, requireAuth }) {
  return async function GET(req: NextRequest) {
    try {
      await deps.requireAuth(req, ["ADMIN"]);
      const { supabase } = deps.apiBootstrap();

      const [queueStatsRes, outboxStatsRes] = await Promise.all([
        supabase.rpc("get_queue_runtime_stats"),
        supabase.rpc("get_outbox_runtime_stats")
      ]);

      if (queueStatsRes.error) throw queueStatsRes.error;
      if (outboxStatsRes.error) throw outboxStatsRes.error;

      const snapshot = buildQueueOutboxRuntimeSnapshot(
        firstRpcRow(queueStatsRes.data),
        firstRpcRow(outboxStatsRes.data)
      );
      const health = classifyQueueOutboxHealth(snapshot, DEFAULT_RUNTIME_HEALTH_THRESHOLDS);

      const body: OpsRuntimeResponseDto = {
        data: {
          ...snapshot,
          health,
          thresholds: DEFAULT_RUNTIME_HEALTH_THRESHOLDS
        }
      };

      return ok(body);
    } catch (error) {
      if (String(error).includes("Unauthorized")) return unauthorized();
      if (String(error).includes("Forbidden")) return forbidden();
      return serverError(error);
    }
  };
}

export const GET = createOpsRuntimeGetHandler();
