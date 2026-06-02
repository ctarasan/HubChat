import { serializeError } from "../lib/serializeError.js";

export type WorkerLoopName = "observability" | "outboxRelay" | "inbound" | "outbound" | "profileAvatarCache";

export interface LoopLivenessSnapshot {
  /** Wall-clock ms when this loop row was registered (supervisor wiring). */
  registeredAt: number;
  /** Set when the loop emits `worker_loop_started` (first iteration). */
  loopStartedAt: number | null;
  lastProgressAt: number;
  lastPollAt: number;
  lastClaimAt: number | null;
  lastClaimedCount: number | null;
  /** First time `claimBatch` / outbox claim completed successfully for this loop (empty batch counts). */
  firstClaimCycleCompletedAt: number | null;
  lastErrorAt: number | null;
  lastErrorSummary: string | null;
  restartCount: number;
  pollIntervalMs: number;
  /** In-flight outbound jobs only (other loops keep 0). */
  activeCount: number;
}

const loops = new Map<WorkerLoopName, LoopLivenessSnapshot>();

export function registerWorkerLoop(name: WorkerLoopName, pollIntervalMs: number): void {
  const now = Date.now();
  loops.set(name, {
    registeredAt: now,
    loopStartedAt: null,
    /** Zero = never progressed; readiness treats as not-yet-live until first poll/claim. */
    lastProgressAt: 0,
    lastPollAt: 0,
    lastClaimAt: null,
    lastClaimedCount: null,
    firstClaimCycleCompletedAt: null,
    lastErrorAt: null,
    lastErrorSummary: null,
    restartCount: 0,
    pollIntervalMs,
    activeCount: 0
  });
}

export function markLoopStarted(name: WorkerLoopName): void {
  const s = loops.get(name);
  if (!s) return;
  const now = Date.now();
  if (s.loopStartedAt == null) s.loopStartedAt = now;
  s.lastProgressAt = now;
}

export function touchLoopProgress(name: WorkerLoopName): void {
  const s = loops.get(name);
  if (!s) return;
  const now = Date.now();
  s.lastProgressAt = now;
}

export function recordLoopPoll(name: WorkerLoopName): void {
  const s = loops.get(name);
  if (!s) return;
  const now = Date.now();
  s.lastPollAt = now;
  s.lastProgressAt = now;
}

export function recordLoopClaimResult(name: WorkerLoopName, claimedCount: number): void {
  const s = loops.get(name);
  if (!s) return;
  const now = Date.now();
  s.lastClaimAt = now;
  s.lastClaimedCount = claimedCount;
  s.lastProgressAt = now;
  if (s.firstClaimCycleCompletedAt == null) s.firstClaimCycleCompletedAt = now;
}

export function recordLoopError(name: WorkerLoopName, err: unknown): void {
  const s = loops.get(name);
  if (!s) return;
  const now = Date.now();
  s.lastErrorAt = now;
  s.lastErrorSummary = serializeError(err).message?.slice(0, 240) ?? "error";
}

export function recordLoopRestart(name: WorkerLoopName): void {
  const s = loops.get(name);
  if (!s) return;
  s.restartCount += 1;
  touchLoopProgress(name);
}

export function incrementOutboundActiveJobs(): void {
  const s = loops.get("outbound");
  if (!s) return;
  s.activeCount += 1;
  touchLoopProgress("outbound");
}

export function decrementOutboundActiveJobs(): void {
  const s = loops.get("outbound");
  if (!s) return;
  s.activeCount = Math.max(0, s.activeCount - 1);
  touchLoopProgress("outbound");
}

export function getOutboundActiveJobCount(): number {
  return loops.get("outbound")?.activeCount ?? 0;
}

/** Stale if no progress for longer than max(60s, pollIntervalMs * 5). */
export function loopStaleThresholdMs(pollIntervalMs: number): number {
  return Math.max(60_000, pollIntervalMs * 5);
}

/**
 * Liveness for any loop: progress age beyond threshold (used for detail / observability).
 * `lastProgressAt === 0` means never touched → infinitely stale.
 */
export function isLoopProgressStale(name: WorkerLoopName, nowMs: number = Date.now()): boolean {
  const s = loops.get(name);
  if (!s) return true;
  const threshold = loopStaleThresholdMs(s.pollIntervalMs);
  const ageMs = nowMs - s.lastProgressAt;
  return ageMs > threshold;
}

export function isWorkerReadinessHealthy(): { ok: boolean; unhealthyLoops: string[]; detail: Record<string, number> } {
  const now = Date.now();
  const unhealthy: string[] = [];
  const detail: Record<string, number> = {};
  for (const [name, s] of loops) {
    const threshold = loopStaleThresholdMs(s.pollIntervalMs);
    const ageMs = now - s.lastProgressAt;
    detail[`${name}_lastProgressAgeMs`] = ageMs;
    if (ageMs > threshold) unhealthy.push(name);
  }
  return { ok: unhealthy.length === 0, unhealthyLoops: unhealthy, detail };
}

export function getLoopSnapshots(): Record<string, LoopLivenessSnapshot> {
  return Object.fromEntries(loops) as Record<string, LoopLivenessSnapshot>;
}

/** Unit tests: clear loop rows (call before registering fresh snapshots). */
export function resetWorkerLoopSnapshotsForTests(): void {
  loops.clear();
}
