import type {
  DepthLagStats,
  OpsLifecycleCounts,
  OpsProcessingStaleThresholds,
  OpsQueueRuntimeDetail,
  QueueOutboxRuntimeSnapshot,
  RuntimeHealthAssessment,
  RuntimeHealthLevel,
  RuntimeHealthThresholds
} from "../domain/observability.js";
import { DEFAULT_RUNTIME_HEALTH_THRESHOLDS } from "../domain/observability.js";

export const OPS_QUEUE_INBOUND_TOPIC = "message.inbound.normalized" as const;
export const OPS_QUEUE_OUTBOUND_TOPIC = "message.outbound.requested" as const;

/** Aligns with default WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS (300). */
export const DEFAULT_OPS_QUEUE_PROCESSING_STALE_SECONDS = 300;
/** Aligns with default outbox relay processing timeout (120). */
export const DEFAULT_OPS_OUTBOX_PROCESSING_STALE_SECONDS = 120;

export const DEFAULT_OPS_PROCESSING_STALE_THRESHOLDS: OpsProcessingStaleThresholds = {
  queueSeconds: DEFAULT_OPS_QUEUE_PROCESSING_STALE_SECONDS,
  outboxSeconds: DEFAULT_OPS_OUTBOX_PROCESSING_STALE_SECONDS
};

type OpsCountFilter =
  | { column: string; op: "eq"; value: string }
  | { column: string; op: "lte"; value: string }
  | { column: string; op: "lt"; value: string };

export type OpsHeadCountQuery = {
  eq(column: string, value: string): OpsHeadCountQuery;
  lte(column: string, value: string): OpsHeadCountQuery;
  lt(column: string, value: string): OpsHeadCountQuery;
};

export type OpsHeadCountClient = {
  from(table: "queue_jobs" | "outbox_events"): {
    select(columns: string, opts: { count: "exact"; head: true }): OpsHeadCountQuery;
  };
};

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

export function emptyOpsLifecycleCounts(): OpsLifecycleCounts {
  return { pending: 0, processing: 0, processingStale: 0, deadLetter: 0 };
}

export function normalizeOpsCount(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function staleUpdatedAtCutoffIso(staleAfterSeconds: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - staleAfterSeconds * 1000).toISOString();
}

async function headCount(
  client: OpsHeadCountClient,
  table: "queue_jobs" | "outbox_events",
  filters: OpsCountFilter[]
): Promise<number> {
  let query: OpsHeadCountQuery = client.from(table).select("id", { count: "exact", head: true });
  for (const f of filters) {
    if (f.op === "eq") query = query.eq(f.column, f.value);
    else if (f.op === "lte") query = query.lte(f.column, f.value);
    else query = query.lt(f.column, f.value);
  }
  const result = await (query as unknown as Promise<{
    count: number | null;
    error: { message: string } | null;
  }>);
  if (result.error) throw result.error;
  return normalizeOpsCount(result.count);
}

async function countQueueTopicLifecycle(
  client: OpsHeadCountClient,
  topic: string,
  pendingAvailableAtLte: string,
  processingStaleCutoff: string
): Promise<OpsLifecycleCounts> {
  const base = (status: string, extra: OpsCountFilter[] = []) =>
    headCount(client, "queue_jobs", [
      { column: "status", op: "eq", value: status },
      { column: "topic", op: "eq", value: topic },
      ...extra
    ]);

  const [pending, processing, processingStale, deadLetter] = await Promise.all([
    base("PENDING", [{ column: "available_at", op: "lte", value: pendingAvailableAtLte }]),
    base("PROCESSING"),
    base("PROCESSING", [{ column: "updated_at", op: "lt", value: processingStaleCutoff }]),
    base("DEAD_LETTER")
  ]);

  return { pending, processing, processingStale, deadLetter };
}

async function countOutboxLifecycle(
  client: OpsHeadCountClient,
  pendingAvailableAtLte: string,
  processingStaleCutoff: string
): Promise<OpsLifecycleCounts> {
  const base = (status: string, extra: OpsCountFilter[] = []) =>
    headCount(client, "outbox_events", [{ column: "status", op: "eq", value: status }, ...extra]);

  const [pending, processing, processingStale, deadLetter] = await Promise.all([
    base("PENDING", [{ column: "available_at", op: "lte", value: pendingAvailableAtLte }]),
    base("PROCESSING"),
    base("PROCESSING", [{ column: "updated_at", op: "lt", value: processingStaleCutoff }]),
    base("DEAD_LETTER")
  ]);

  return { pending, processing, processingStale, deadLetter };
}

export async function fetchOpsQueueOutboxDetails(
  client: OpsHeadCountClient,
  collectedAt: string = new Date().toISOString(),
  staleThresholds: OpsProcessingStaleThresholds = DEFAULT_OPS_PROCESSING_STALE_THRESHOLDS
): Promise<{ queueDetail: OpsQueueRuntimeDetail; outboxDetail: OpsLifecycleCounts }> {
  const queueStaleCutoff = staleUpdatedAtCutoffIso(staleThresholds.queueSeconds, Date.parse(collectedAt));
  const outboxStaleCutoff = staleUpdatedAtCutoffIso(staleThresholds.outboxSeconds, Date.parse(collectedAt));

  const [inbound, outbound, outboxDetail] = await Promise.all([
    countQueueTopicLifecycle(client, OPS_QUEUE_INBOUND_TOPIC, collectedAt, queueStaleCutoff),
    countQueueTopicLifecycle(client, OPS_QUEUE_OUTBOUND_TOPIC, collectedAt, queueStaleCutoff),
    countOutboxLifecycle(client, collectedAt, outboxStaleCutoff)
  ]);

  return {
    queueDetail: { inbound, outbound },
    outboxDetail
  };
}

function maxLevel(a: RuntimeHealthLevel, b: RuntimeHealthLevel): RuntimeHealthLevel {
  const order: RuntimeHealthLevel[] = ["ok", "warn", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] ?? "critical";
}

export type OpsRuntimeHealthExtras = {
  queueDetail: OpsQueueRuntimeDetail;
  outboxDetail: OpsLifecycleCounts;
};

export function classifyQueueOutboxHealth(
  snapshot: QueueOutboxRuntimeSnapshot,
  thresholds: RuntimeHealthThresholds = DEFAULT_RUNTIME_HEALTH_THRESHOLDS,
  extras?: OpsRuntimeHealthExtras
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

  if (extras) {
    const bumpStale = (token: string, count: number) => {
      if (count <= 0) return;
      reasons.push(`${token}:${count}`);
      level = maxLevel(level, "critical");
    };
    const bumpDeadLetter = (token: string, count: number) => {
      if (count <= 0) return;
      reasons.push(`${token}:${count}`);
      level = maxLevel(level, "warn");
    };

    bumpStale("queue_inbound_processing_stale", extras.queueDetail.inbound.processingStale);
    bumpStale("queue_outbound_processing_stale", extras.queueDetail.outbound.processingStale);
    bumpStale("outbox_processing_stale", extras.outboxDetail.processingStale);

    bumpDeadLetter("queue_inbound_dead_letter", extras.queueDetail.inbound.deadLetter);
    bumpDeadLetter("queue_outbound_dead_letter", extras.queueDetail.outbound.deadLetter);
    bumpDeadLetter("outbox_dead_letter", extras.outboxDetail.deadLetter);
  }

  return { level, reasons };
}
