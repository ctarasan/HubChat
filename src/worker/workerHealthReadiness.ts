import { getLoopSnapshots, isWorkerReadinessHealthy } from "./workerLoopLiveness.js";
import { workerMetrics } from "./workerMetrics.js";
import type { WorkerHealthReadiness } from "./workerHealthServer.js";

export function buildWorkerHealthReadiness(): WorkerHealthReadiness {
  const { ok, unhealthyLoops, detail } = isWorkerReadinessHealthy();
  const loops = getLoopSnapshots();
  const body: Record<string, unknown> = {
    ok,
    unhealthyLoops,
    detail,
    loops,
    outbound: loops.outbound ?? null,
    inbound: loops.inbound ?? null,
    outboxRelay: loops.outboxRelay ?? null,
    observability: loops.observability ?? null,
    metrics: workerMetrics.snapshot()
  };
  return { ok, body };
}
