import { getLoopSnapshots, loopStaleThresholdMs, type LoopLivenessSnapshot, type WorkerLoopName } from "./workerLoopLiveness.js";
import { workerMetrics } from "./workerMetrics.js";
import type { WorkerHealthReadiness } from "./workerHealthServer.js";
import { isWorkerEnvParsedOk, isWorkerSupabaseSanityOk } from "./workerBootGate.js";
import { isWorkerShuttingDown } from "./workerShutdownCoordinator.js";

const OUTBOUND_QUEUE_TOPIC = "message.outbound.requested" as const;

export type WorkerDeploymentStatus = "starting" | "healthy" | "unhealthy";

function iso(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function loopOutboundTopic(name: WorkerLoopName): string {
  if (name === "outbound") return OUTBOUND_QUEUE_TOPIC;
  if (name === "inbound") return "message.inbound.normalized";
  if (name === "outboxRelay") return "ALL";
  return "observability";
}

function computeLoopReady(name: WorkerLoopName, s: LoopLivenessSnapshot, nowMs: number): boolean {
  if (s.loopStartedAt == null) return false;
  if (s.lastPollAt <= 0) return false;
  const ageMs = nowMs - s.lastProgressAt;
  if (ageMs > loopStaleThresholdMs(s.pollIntervalMs)) return false;
  if (name === "observability") return true;
  return s.firstClaimCycleCompletedAt != null;
}

function computeOutboundUnhealthyStall(s: LoopLivenessSnapshot, nowMs: number): boolean {
  /** Live poll happened but progress stalled beyond threshold (dead loop). */
  if (s.lastPollAt <= 0) return false;
  const ageMs = nowMs - s.lastProgressAt;
  return ageMs > loopStaleThresholdMs(s.pollIntervalMs);
}

function buildLoopView(name: WorkerLoopName, s: LoopLivenessSnapshot | undefined, nowMs: number): Record<string, unknown> {
  if (!s) {
    return {
      topic: loopOutboundTopic(name),
      startedAt: null,
      lastPollAt: null,
      lastClaimAt: null,
      lastClaimedCount: null,
      lastErrorAt: null,
      restartCount: 0,
      ready: false,
      activeCount: 0
    };
  }
  return {
    topic: loopOutboundTopic(name),
    startedAt: iso(s.loopStartedAt),
    lastPollAt: iso(s.lastPollAt),
    lastClaimAt: iso(s.lastClaimAt),
    lastClaimedCount: s.lastClaimedCount,
    lastErrorAt: iso(s.lastErrorAt),
    restartCount: s.restartCount,
    ready: computeLoopReady(name, s, nowMs),
    activeCount: name === "outbound" ? s.activeCount : 0
  };
}

/** Exported for unit tests (same logic as HTTP `/ready`). */
export function computeWorkerDeploymentStatus(nowMs: number = Date.now()): {
  status: WorkerDeploymentStatus;
  httpOk: boolean;
  outboundReady: boolean;
  outboundStalled: boolean;
} {
  const envOk = isWorkerEnvParsedOk();
  const supabaseOk = isWorkerSupabaseSanityOk();
  const shuttingDown = isWorkerShuttingDown();
  const snaps = getLoopSnapshots();
  const outbound = snaps.outbound;

  if (!envOk || !supabaseOk || shuttingDown) {
    return { status: "unhealthy", httpOk: false, outboundReady: false, outboundStalled: false };
  }

  if (!outbound) {
    return { status: "unhealthy", httpOk: false, outboundReady: false, outboundStalled: false };
  }

  const outboundStalled = computeOutboundUnhealthyStall(outbound, nowMs);
  if (outboundStalled) {
    return { status: "unhealthy", httpOk: false, outboundReady: false, outboundStalled: true };
  }

  const outboundReady = computeLoopReady("outbound", outbound, nowMs);
  if (!outboundReady) {
    return { status: "starting", httpOk: false, outboundReady: false, outboundStalled: false };
  }

  /** Other loops: if registered but dead, surface as unhealthy (ops signal). */
  const otherStale = (["inbound", "outboxRelay", "observability"] as const).some((k) => {
    const s = snaps[k];
    if (!s) return false;
    if (s.lastPollAt <= 0) return false;
    return nowMs - s.lastProgressAt > loopStaleThresholdMs(s.pollIntervalMs);
  });

  if (otherStale) {
    return { status: "unhealthy", httpOk: false, outboundReady: true, outboundStalled: false };
  }

  return { status: "healthy", httpOk: true, outboundReady: true, outboundStalled: false };
}

function listStaleStartedLoops(nowMs: number): { unhealthyLoops: string[]; detail: Record<string, number> } {
  const unhealthy: string[] = [];
  const detail: Record<string, number> = {};
  for (const [name, s] of Object.entries(getLoopSnapshots()) as Array<[WorkerLoopName, LoopLivenessSnapshot]>) {
    const threshold = loopStaleThresholdMs(s.pollIntervalMs);
    const ageMs = nowMs - s.lastProgressAt;
    detail[`${name}_lastProgressAgeMs`] = ageMs;
    if (s.lastPollAt > 0 && ageMs > threshold) unhealthy.push(name);
  }
  return { unhealthyLoops: unhealthy, detail };
}

export function buildWorkerHealthReadiness(): WorkerHealthReadiness {
  const nowMs = Date.now();
  const snaps = getLoopSnapshots();
  const { status, httpOk, outboundReady, outboundStalled } = computeWorkerDeploymentStatus(nowMs);
  const { unhealthyLoops, detail } = listStaleStartedLoops(nowMs);

  const loops = {
    outbound: buildLoopView("outbound", snaps.outbound, nowMs),
    inbound: buildLoopView("inbound", snaps.inbound, nowMs),
    outbox: buildLoopView("outboxRelay", snaps.outboxRelay, nowMs),
    observability: buildLoopView("observability", snaps.observability, nowMs)
  };

  const commitSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  const body: Record<string, unknown> = {
    status,
    commitSha,
    uptimeSeconds: Math.floor(process.uptime()),
    loops,
    outboundReady,
    outboundStalled,
    queueTopicOutbound: OUTBOUND_QUEUE_TOPIC,
    metrics: workerMetrics.snapshot(),
    ok: httpOk,
    unhealthyLoops,
    detail,
    shuttingDown: isWorkerShuttingDown()
  };
  return { ok: httpOk, body };
}
