import { serializeError } from "../lib/serializeError.js";

export type WorkerLoopName = "observability" | "outboxRelay" | "inbound" | "outbound";

export interface LoopLivenessSnapshot {
  startedAt: number;
  lastProgressAt: number;
  lastPollAt: number;
  lastClaimAt: number | null;
  lastClaimedCount: number | null;
  lastErrorAt: number | null;
  lastErrorSummary: string | null;
  restartCount: number;
  pollIntervalMs: number;
}

const loops = new Map<WorkerLoopName, LoopLivenessSnapshot>();

export function registerWorkerLoop(name: WorkerLoopName, pollIntervalMs: number): void {
  const now = Date.now();
  loops.set(name, {
    startedAt: now,
    lastProgressAt: now,
    lastPollAt: now,
    lastClaimAt: null,
    lastClaimedCount: null,
    lastErrorAt: null,
    lastErrorSummary: null,
    restartCount: 0,
    pollIntervalMs
  });
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

/** Stale if no progress for longer than max(60s, pollIntervalMs * 5). */
export function loopStaleThresholdMs(pollIntervalMs: number): number {
  return Math.max(60_000, pollIntervalMs * 5);
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
