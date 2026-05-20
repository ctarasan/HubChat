import type {
  DepthLagStats,
  QueueOutboxRuntimeSnapshot,
  RuntimeHealthAssessment,
  RuntimeHealthLevel,
  RuntimeHealthThresholds
} from "../domain/observability.js";
import { DEFAULT_RUNTIME_HEALTH_THRESHOLDS } from "../domain/observability.js";

/**
 * Normalize a single row from get_queue_runtime_stats / get_outbox_runtime_stats RPC.
 */
export function normalizeRpcDepthLagRow(row: unknown): DepthLagStats {
  const r = row as { depth?: unknown; lag_ms?: unknown } | null | undefined;
  const depth = Number(r?.depth ?? 0);
  const lagMs = Number(r?.lag_ms ?? 0);
  return {
    depth: Number.isFinite(depth) && depth >= 0 ? Math.floor(depth) : 0,
    lagMs: Number.isFinite(lagMs) && lagMs >= 0 ? Math.floor(lagMs) : 0
  };
}

/**
 * Extract first row from Supabase RPC result (array or single object).
 */
export function firstRpcRow(data: unknown): unknown {
  if (Array.isArray(data)) return data[0];
  return data;
}

export function buildQueueOutboxRuntimeSnapshot(
  queueRow: unknown,
  outboxRow: unknown,
  collectedAt: string = new Date().toISOString()
): QueueOutboxRuntimeSnapshot {
  return {
    queue: normalizeRpcDepthLagRow(queueRow),
    outbox: normalizeRpcDepthLagRow(outboxRow),
    collectedAt
  };
}

function maxLevel(a: RuntimeHealthLevel, b: RuntimeHealthLevel): RuntimeHealthLevel {
  const order: RuntimeHealthLevel[] = ["ok", "warn", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] ?? "critical";
}

export function classifyQueueOutboxHealth(
  snapshot: QueueOutboxRuntimeSnapshot,
  thresholds: RuntimeHealthThresholds = DEFAULT_RUNTIME_HEALTH_THRESHOLDS
): RuntimeHealthAssessment {
  const reasons: string[] = [];
  let level: RuntimeHealthLevel = "ok";

  const check = (
    label: string,
    depth: number,
    lagMs: number,
    depthWarn: number,
    depthCritical: number,
    lagWarn: number,
    lagCritical: number
  ) => {
    if (depth >= depthCritical) {
      reasons.push(`${label}_depth_critical:${depth}`);
      level = maxLevel(level, "critical");
    } else if (depth >= depthWarn) {
      reasons.push(`${label}_depth_warn:${depth}`);
      level = maxLevel(level, "warn");
    }
    if (lagMs >= lagCritical) {
      reasons.push(`${label}_lag_critical_ms:${lagMs}`);
      level = maxLevel(level, "critical");
    } else if (lagMs >= lagWarn) {
      reasons.push(`${label}_lag_warn_ms:${lagMs}`);
      level = maxLevel(level, "warn");
    }
  };

  check(
    "queue",
    snapshot.queue.depth,
    snapshot.queue.lagMs,
    thresholds.queueDepthWarn,
    thresholds.queueDepthCritical,
    thresholds.queueLagMsWarn,
    thresholds.queueLagMsCritical
  );
  check(
    "outbox",
    snapshot.outbox.depth,
    snapshot.outbox.lagMs,
    thresholds.outboxDepthWarn,
    thresholds.outboxDepthCritical,
    thresholds.outboxLagMsWarn,
    thresholds.outboxLagMsCritical
  );

  return { level, reasons };
}
