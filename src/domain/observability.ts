/** Depth and oldest-PENDING lag for queue_jobs or outbox_events (from DB RPC). */
export type DepthLagStats = {
  depth: number;
  lagMs: number;
};

export type RuntimeHealthLevel = "ok" | "warn" | "critical";

/** Read-only queue/outbox snapshot for ops dashboards and health checks. */
export type QueueOutboxRuntimeSnapshot = {
  queue: DepthLagStats;
  outbox: DepthLagStats;
  collectedAt: string;
};

export type RuntimeHealthAssessment = {
  level: RuntimeHealthLevel;
  reasons: string[];
};

/** Thresholds for PENDING depth/lag classification (tunable via env later). */
export type RuntimeHealthThresholds = {
  queueDepthWarn: number;
  queueDepthCritical: number;
  queueLagMsWarn: number;
  queueLagMsCritical: number;
  outboxDepthWarn: number;
  outboxDepthCritical: number;
  outboxLagMsWarn: number;
  outboxLagMsCritical: number;
};

export const DEFAULT_RUNTIME_HEALTH_THRESHOLDS: RuntimeHealthThresholds = {
  queueDepthWarn: 50,
  queueDepthCritical: 200,
  queueLagMsWarn: 60_000,
  queueLagMsCritical: 300_000,
  outboxDepthWarn: 50,
  outboxDepthCritical: 200,
  outboxLagMsWarn: 60_000,
  outboxLagMsCritical: 300_000
};

/** Stable API contract for GET /api/ops/runtime (Agent B / ops tooling). */
export type OpsRuntimeResponseDto = {
  data: QueueOutboxRuntimeSnapshot & {
    health: RuntimeHealthAssessment;
    thresholds: RuntimeHealthThresholds;
  };
};

export type PayloadCostTier = "low" | "medium" | "high" | "very_high";

export type ListResponseCostReport = {
  route: string;
  itemCount: number;
  limit: number;
  hasCursor: boolean;
  estimatedUtf8Bytes: number;
  tier: PayloadCostTier;
};

/** Safe fields for HUBCHAT_DIAGNOSTIC_LOGS — no message bodies or secrets. */
export type ApiListDiagnosticFields = {
  route: string;
  tenantId: string;
  limit: number;
  hasCursor: boolean;
  rawRowCount: number;
  responseRowCount: number;
  estimatedUtf8Bytes?: number;
  payloadTier?: PayloadCostTier;
  filters?: Record<string, string | null>;
};
