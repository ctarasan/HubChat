import type { SupabaseClient } from "@supabase/supabase-js";
import pino from "pino";
import { workerMetrics } from "./workerMetrics.js";
import { serializeError } from "../lib/serializeError.js";
import { recordLoopError, recordLoopPoll, touchLoopProgress } from "./workerLoopLiveness.js";
import { emitWorkerLoopError, emitWorkerLoopPoll, emitWorkerLoopStarted } from "./workerJsonConsole.js";

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

  async runForever(pollIntervalMs = 5000, pollLogIntervalMs = 30_000): Promise<void> {
    let lastPollLogAt = 0;
    let loopStartedLogged = false;
    while (true) {
      if (!loopStartedLogged) {
        loopStartedLogged = true;
        emitWorkerLoopStarted("observability", { pollIntervalMs });
        logger.info(
          {
            event: "worker_loop_started",
            loop: "observability",
            pollIntervalMs
          },
          "observability_loop_started"
        );
      }
      try {
        recordLoopPoll("observability");
        const now = Date.now();
        if (now - lastPollLogAt >= pollLogIntervalMs) {
          lastPollLogAt = now;
          const lastPollAt = new Date(now).toISOString();
          emitWorkerLoopPoll("observability", { pollIntervalMs, lastPollAt });
          logger.info(
            {
              event: "worker_loop_poll",
              loop: "observability",
              pollIntervalMs,
              lastPollAt
            },
            "observability_poll"
          );
        }
        await this.pollQueueAndOutboxStats();
        touchLoopProgress("observability");
        logger.info(workerMetrics.snapshot(), "Worker metrics snapshot");
      } catch (error) {
        recordLoopError("observability", error);
        emitWorkerLoopError("observability", error, {
          pollIntervalMs,
          pid: process.pid
        });
        logger.error(
          {
            event: "worker_loop_error",
            loop: "observability",
            error: serializeError(error),
            worker: "worker-observability",
            pid: process.pid
          },
          "observability_iteration_error"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
