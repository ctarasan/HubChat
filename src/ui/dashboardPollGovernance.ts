/** Poll interval for /api/conversations (ms). Set NEXT_PUBLIC_CONVERSATIONS_POLL_INTERVAL_MS=0 to disable. Default 20000. */
export const DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS = 20_000;

/** Max slowdown factor after repeated silent refresh failures (4x base interval). */
export const MAX_POLL_BACKOFF_MULTIPLIER = 4;

export function parseConversationsPollIntervalMs(
  raw: string | undefined = process.env.NEXT_PUBLIC_CONVERSATIONS_POLL_INTERVAL_MS
): number {
  if (raw === undefined || raw === "") return DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS;
  return n;
}

export function computePollBackoffIntervalMs(
  baseIntervalMs: number,
  consecutiveFailures: number,
  maxMultiplier: number = MAX_POLL_BACKOFF_MULTIPLIER
): number {
  if (baseIntervalMs <= 0) return 0;
  if (consecutiveFailures <= 0) return baseIntervalMs;
  const multiplier = Math.min(maxMultiplier, 2 ** consecutiveFailures);
  return baseIntervalMs * multiplier;
}

export type DashboardPollSchedulerDeps = {
  baseIntervalMs: number;
  refresh: () => Promise<boolean>;
  isDocumentVisible?: () => boolean;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
};

/**
 * Governs silent conversation-list polling: visibility-aware scheduling,
 * in-flight deduplication, and exponential backoff after failures.
 */
export class DashboardConversationPollScheduler {
  private consecutiveFailures = 0;
  private inFlight = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly isDocumentVisible: () => boolean;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;

  constructor(private readonly deps: DashboardPollSchedulerDeps) {
    this.isDocumentVisible = deps.isDocumentVisible ?? (() =>
      typeof document === "undefined" ? true : document.visibilityState === "visible");
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((id) => clearTimeout(id));
  }

  start(): void {
    if (this.deps.baseIntervalMs <= 0 || this.disposed) return;
    this.scheduleNext(this.deps.baseIntervalMs);
  }

  stop(): void {
    this.disposed = true;
    this.clearPendingTimer();
  }

  /** Call on document visibilitychange; refreshes immediately when tab becomes visible. */
  onDocumentVisibilityChange(): Promise<void> {
    if (this.disposed || this.deps.baseIntervalMs <= 0) return Promise.resolve();
    if (!this.isDocumentVisible()) {
      this.clearPendingTimer();
      return Promise.resolve();
    }
    return this.runRefresh();
  }

  private clearPendingTimer(): void {
    if (this.timerId !== null) {
      this.clearTimeoutFn(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.disposed || this.deps.baseIntervalMs <= 0) return;
    this.clearPendingTimer();
    if (!this.isDocumentVisible()) return;
    const safeDelay = Math.max(0, delayMs);
    this.timerId = this.setTimeoutFn(() => {
      this.timerId = null;
      void this.runRefresh();
    }, safeDelay);
  }

  private async runRefresh(): Promise<void> {
    if (this.disposed || this.deps.baseIntervalMs <= 0) return;
    if (!this.isDocumentVisible()) return;
    if (this.inFlight) return;

    this.inFlight = true;
    let ok = false;
    try {
      ok = await this.deps.refresh();
    } catch {
      ok = false;
    } finally {
      this.inFlight = false;
    }

    if (this.disposed) return;

    if (ok) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures += 1;
    }

    const nextDelay = computePollBackoffIntervalMs(this.deps.baseIntervalMs, this.consecutiveFailures);
    this.scheduleNext(nextDelay);
  }
}
