import { getLoopSnapshots, isWorkerReadinessHealthy } from "./workerLoopLiveness.js";
import { workerMetrics } from "./workerMetrics.js";
import type { WorkerHealthReadiness } from "./workerHealthServer.js";

export function buildWorkerHealthReadiness(): WorkerHealthReadiness {
  const { ok, unhealthyLoops, detail } = isWorkerReadinessHealthy();
  const body: Record<string, unknown> = {
    ok,
    unhealthyLoops,
    detail,
    loops: getLoopSnapshots(),
    metrics: workerMetrics.snapshot()
  };
  return { ok, body };
}
