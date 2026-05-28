export type OpsRuntimeHealthLevel = "ok" | "warn" | "critical";

export type OpsRuntimeDepthLag = {
  depth: number;
  lagMs: number;
};

export type OpsRuntimeLifecycleCounts = {
  pending: number;
  processing: number;
  processingStale: number;
  deadLetter: number;
};

export type OpsRuntimeQueueDetail = {
  inbound: OpsRuntimeLifecycleCounts;
  outbound: OpsRuntimeLifecycleCounts;
};

export type OpsRuntimeData = {
  queue: OpsRuntimeDepthLag;
  outbox: OpsRuntimeDepthLag;
  collectedAt: string;
  queueDetail: OpsRuntimeQueueDetail;
  outboxDetail: OpsRuntimeLifecycleCounts;
  processingStaleAfterSeconds: {
    queueSeconds: number;
    outboxSeconds: number;
  };
  health: {
    level: OpsRuntimeHealthLevel;
    reasons: string[];
  };
  thresholds: {
    queueDepthWarn: number;
    queueDepthCritical: number;
    queueLagMsWarn: number;
    queueLagMsCritical: number;
    outboxDepthWarn: number;
    outboxDepthCritical: number;
    outboxLagMsWarn: number;
    outboxLagMsCritical: number;
  };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readNonNegativeInt(v: unknown, field: string): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

function readDepthLag(v: unknown, label: string): OpsRuntimeDepthLag | null {
  if (!isRecord(v)) return null;
  const depth = readNonNegativeInt(v.depth, `${label}.depth`);
  const lagMs = readNonNegativeInt(v.lagMs, `${label}.lagMs`);
  if (depth === null || lagMs === null) return null;
  return { depth, lagMs };
}

function readLifecycleCounts(v: unknown, label: string): OpsRuntimeLifecycleCounts | null {
  if (!isRecord(v)) return null;
  const pending = readNonNegativeInt(v.pending, `${label}.pending`);
  const processing = readNonNegativeInt(v.processing, `${label}.processing`);
  const processingStale = readNonNegativeInt(v.processingStale, `${label}.processingStale`);
  const deadLetter = readNonNegativeInt(v.deadLetter, `${label}.deadLetter`);
  if (pending === null || processing === null || processingStale === null || deadLetter === null) {
    return null;
  }
  return { pending, processing, processingStale, deadLetter };
}

function readQueueDetail(v: unknown): OpsRuntimeQueueDetail | null {
  if (!isRecord(v)) return null;
  const inbound = readLifecycleCounts(v.inbound, "queueDetail.inbound");
  const outbound = readLifecycleCounts(v.outbound, "queueDetail.outbound");
  if (!inbound || !outbound) return null;
  return { inbound, outbound };
}

function readHealthLevel(v: unknown): OpsRuntimeHealthLevel | null {
  if (v === "ok" || v === "warn" || v === "critical") return v;
  return null;
}

export function parseOpsRuntimeResponse(
  body: unknown
): { ok: true; data: OpsRuntimeData } | { ok: false; error: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, error: "Invalid response: missing data object." };
  }
  const raw = body.data;
  const queue = readDepthLag(raw.queue, "queue");
  const outbox = readDepthLag(raw.outbox, "outbox");
  if (!queue || !outbox) {
    return { ok: false, error: "Invalid response: queue or outbox stats missing." };
  }
  const collectedAt = typeof raw.collectedAt === "string" ? raw.collectedAt.trim() : "";
  if (!collectedAt || Number.isNaN(Date.parse(collectedAt))) {
    return { ok: false, error: "Invalid response: collectedAt is not a valid timestamp." };
  }
  if (!isRecord(raw.health)) {
    return { ok: false, error: "Invalid response: health object missing." };
  }
  const level = readHealthLevel(raw.health.level);
  if (!level) {
    return { ok: false, error: "Invalid response: health.level must be ok, warn, or critical." };
  }
  const reasonsRaw = raw.health.reasons;
  const reasons = Array.isArray(reasonsRaw)
    ? reasonsRaw.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];

  if (!isRecord(raw.thresholds)) {
    return { ok: false, error: "Invalid response: thresholds object missing." };
  }
  const t = raw.thresholds;
  const queueDepthWarn = readNonNegativeInt(t.queueDepthWarn, "queueDepthWarn");
  const queueDepthCritical = readNonNegativeInt(t.queueDepthCritical, "queueDepthCritical");
  const queueLagMsWarn = readNonNegativeInt(t.queueLagMsWarn, "queueLagMsWarn");
  const queueLagMsCritical = readNonNegativeInt(t.queueLagMsCritical, "queueLagMsCritical");
  const outboxDepthWarn = readNonNegativeInt(t.outboxDepthWarn, "outboxDepthWarn");
  const outboxDepthCritical = readNonNegativeInt(t.outboxDepthCritical, "outboxDepthCritical");
  const outboxLagMsWarn = readNonNegativeInt(t.outboxLagMsWarn, "outboxLagMsWarn");
  const outboxLagMsCritical = readNonNegativeInt(t.outboxLagMsCritical, "outboxLagMsCritical");
  if (
    queueDepthWarn === null ||
    queueDepthCritical === null ||
    queueLagMsWarn === null ||
    queueLagMsCritical === null ||
    outboxDepthWarn === null ||
    outboxDepthCritical === null ||
    outboxLagMsWarn === null ||
    outboxLagMsCritical === null
  ) {
    return { ok: false, error: "Invalid response: thresholds fields invalid." };
  }

  const queueDetail = readQueueDetail(raw.queueDetail);
  if (!queueDetail) {
    return { ok: false, error: "Invalid response: queueDetail missing or invalid." };
  }
  const outboxDetail = readLifecycleCounts(raw.outboxDetail, "outboxDetail");
  if (!outboxDetail) {
    return { ok: false, error: "Invalid response: outboxDetail missing or invalid." };
  }
  if (!isRecord(raw.processingStaleAfterSeconds)) {
    return { ok: false, error: "Invalid response: processingStaleAfterSeconds missing." };
  }
  const queueSeconds = readNonNegativeInt(
    raw.processingStaleAfterSeconds.queueSeconds,
    "processingStaleAfterSeconds.queueSeconds"
  );
  const outboxSeconds = readNonNegativeInt(
    raw.processingStaleAfterSeconds.outboxSeconds,
    "processingStaleAfterSeconds.outboxSeconds"
  );
  if (queueSeconds === null || outboxSeconds === null) {
    return { ok: false, error: "Invalid response: processingStaleAfterSeconds fields invalid." };
  }

  return {
    ok: true,
    data: {
      queue,
      outbox,
      collectedAt,
      queueDetail,
      outboxDetail,
      processingStaleAfterSeconds: { queueSeconds, outboxSeconds },
      health: { level, reasons },
      thresholds: {
        queueDepthWarn,
        queueDepthCritical,
        queueLagMsWarn,
        queueLagMsCritical,
        outboxDepthWarn,
        outboxDepthCritical,
        outboxLagMsWarn,
        outboxLagMsCritical
      }
    }
  };
}

export function formatLagMs(lagMs: number): string {
  if (!Number.isFinite(lagMs) || lagMs < 0) return "—";
  if (lagMs < 1000) return `${lagMs} ms`;
  const sec = lagMs / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s`;
  const min = sec / 60;
  if (min < 60) return `${min < 10 ? min.toFixed(1) : Math.round(min)} min`;
  const hr = min / 60;
  return `${hr < 10 ? hr.toFixed(1) : Math.round(hr)} h`;
}

export function formatCollectedAt(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

export function healthLevelLabel(level: OpsRuntimeHealthLevel): string {
  if (level === "ok") return "Healthy";
  if (level === "warn") return "Warning";
  return "Critical";
}

export function healthLevelCssClass(level: OpsRuntimeHealthLevel): string {
  return `ops-runtime-health-${level}`;
}

/** Humanize backend reason tokens for display (e.g. queue_depth_warn:60). */
export function formatHealthReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return trimmed;
  const [code, value] = trimmed.split(":");
  const label = code.replaceAll("_", " ");
  return value ? `${label} (${value})` : label;
}

export function mapOpsFetchError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "Ops Runtime is available to Admins only.";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }
  if (status >= 500) return "Server error while loading ops runtime. Try again shortly.";
  return `Could not load ops runtime (HTTP ${status}).`;
}

export function isDeadLetterReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) return false;
  const [code] = trimmed.split(":");
  return code.includes("dead_letter");
}

export function isStaleProcessingReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) return false;
  const [code] = trimmed.split(":");
  return code.includes("processing_stale");
}

export function isPendingBacklogReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) return false;
  const [code] = trimmed.split(":");
  return code.includes("_depth_") || code.includes("_lag_");
}
