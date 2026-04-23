import type { SupabaseClient } from "@supabase/supabase-js";
import pino from "pino";
import { workerMetrics } from "./workerMetrics.js";

const logger = pino({ name: "worker-observability" });

export class WorkerObservability {
  constructor(private readonly supabase: SupabaseClient) {}

  async pollQueueAndOutboxStats(): Promise<void> {
    const [queueStatsRes, outboxStatsRes] = await Promise.all([
      this.supabase.rpc("get_queue_runtime_stats"),
      this.supabase.rpc("get_outbox_runtime_stats")
    ]);
    if (queueStatsRes.error) throw queueStatsRes.error;
    if (outboxStatsRes.error) throw outboxStatsRes.error;

    const queueRow = Array.isArray(queueStatsRes.data) ? queueStatsRes.data[0] : queueStatsRes.data;
    const outboxRow = Array.isArray(outboxStatsRes.data) ? outboxStatsRes.data[0] : outboxStatsRes.data;

    workerMetrics.setQueueDepth(Number(queueRow?.depth ?? 0));
    workerMetrics.setQueueLagMs(Number(queueRow?.lag_ms ?? 0));
    workerMetrics.setOutboxDepth(Number(outboxRow?.depth ?? 0));
    workerMetrics.setOutboxLagMs(Number(outboxRow?.lag_ms ?? 0));
  }

  async runForever(pollIntervalMs = 5000): Promise<void> {
    while (true) {
      try {
        await this.pollQueueAndOutboxStats();
        logger.info(workerMetrics.snapshot(), "Worker metrics snapshot");
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? { name: error.name, message: error.message } : String(error) },
          "Failed to poll worker runtime stats"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
