import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeError } from "./serializeError.js";

/**
 * Fail fast if service-role cannot reach queue/outbox RPCs used at runtime.
 * Does not mutate queue/outbox data beyond harmless empty claims.
 */
export async function validateWorkerSupabase(
  supabase: SupabaseClient,
  opts: {
    queueClaimProcessingTimeoutSeconds: number;
    outboxProcessingTimeoutSeconds: number;
  }
): Promise<void> {
  const { queueClaimProcessingTimeoutSeconds, outboxProcessingTimeoutSeconds } = opts;

  const tableProbe = await supabase.from("queue_jobs").select("id").limit(1);
  if (tableProbe.error) {
    const se = serializeError(tableProbe.error);
    throw new Error(`Worker DB check failed [queue_jobs_select]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
  }

  const claimQueue = await supabase.rpc("claim_queue_jobs", {
    p_topic: "__hub_worker_startup_probe__",
    p_limit: 1,
    p_processing_timeout_seconds: queueClaimProcessingTimeoutSeconds
  });

  if (claimQueue.error) {
    const msg = String((claimQueue.error as { message?: string }).message ?? "");
    const code = (claimQueue.error as { code?: string }).code;
    const legacyRpcMismatch =
      code === "42883" || (/claim_queue_jobs/i.test(msg) && /does not exist|could not find|no function|argument/i.test(msg));

    if (legacyRpcMismatch) {
      const legacyCall = await supabase.rpc("claim_queue_jobs", {
        p_topic: "__hub_worker_startup_probe__",
        p_limit: 1
      });
      if (legacyCall.error) {
        const se = serializeError(legacyCall.error);
        throw new Error(`Worker DB check failed [claim_queue_jobs]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
      }
    } else {
      const se = serializeError(claimQueue.error);
      throw new Error(`Worker DB check failed [claim_queue_jobs]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
    }
  }

  const queueStats = await supabase.rpc("get_queue_runtime_stats");
  if (queueStats.error) {
    const se = serializeError(queueStats.error);
    throw new Error(`Worker DB check failed [get_queue_runtime_stats]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
  }

  const outboxStats = await supabase.rpc("get_outbox_runtime_stats");
  if (outboxStats.error) {
    const se = serializeError(outboxStats.error);
    throw new Error(`Worker DB check failed [get_outbox_runtime_stats]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
  }

  const claimOutbox = await supabase.rpc("claim_outbox_events", {
    p_topic: null,
    p_limit: 1,
    p_processing_timeout_seconds: outboxProcessingTimeoutSeconds
  });
  if (claimOutbox.error) {
    const se = serializeError(claimOutbox.error);
    throw new Error(`Worker DB check failed [claim_outbox_events]: ${se.message}${se.code ? ` (${se.code})` : ""}`);
  }
}
