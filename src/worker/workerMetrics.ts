type CounterKey =
  | "queueJobsProcessed"
  | "queueJobsFailed"
  | "queueJobsRetried"
  | "queueJobsDeadLettered"
  | "outboxEventsRelayed"
  | "outboxEventsFailed"
  | "outboxEventsDeadLettered"
  | "webhookEventsAccepted";

interface GaugeState {
  queueDepth: number;
  queueLagMs: number;
  outboxDepth: number;
  outboxLagMs: number;
  providerLatencyMsP95: number;
}

export class WorkerMetrics {
  private counters: Record<CounterKey, number> = {
    queueJobsProcessed: 0,
    queueJobsFailed: 0,
    queueJobsRetried: 0,
    queueJobsDeadLettered: 0,
    outboxEventsRelayed: 0,
    outboxEventsFailed: 0,
    outboxEventsDeadLettered: 0,
    webhookEventsAccepted: 0
  };
  private gauges: GaugeState = {
    queueDepth: 0,
    queueLagMs: 0,
    outboxDepth: 0,
    outboxLagMs: 0,
    providerLatencyMsP95: 0
  };
  private readonly startMs = Date.now();
  private providerLatencies: number[] = [];

  incr(key: CounterKey, by = 1): void {
    this.counters[key] += by;
  }

  observeProviderLatency(latencyMs: number): void {
    this.providerLatencies.push(latencyMs);
    if (this.providerLatencies.length > 2000) {
      this.providerLatencies = this.providerLatencies.slice(-1000);
    }
    const sorted = [...this.providerLatencies].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
    this.gauges.providerLatencyMsP95 = sorted[idx] ?? 0;
  }

  setQueueDepth(depth: number): void {
    this.gauges.queueDepth = Math.max(0, depth);
  }
  setQueueLagMs(lagMs: number): void {
    this.gauges.queueLagMs = Math.max(0, lagMs);
  }
  setOutboxDepth(depth: number): void {
    this.gauges.outboxDepth = Math.max(0, depth);
  }
  setOutboxLagMs(lagMs: number): void {
    this.gauges.outboxLagMs = Math.max(0, lagMs);
  }

  snapshot() {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - this.startMs) / 1000));
    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      rates: {
        jobsProcessedPerSec: Number((this.counters.queueJobsProcessed / elapsedSeconds).toFixed(2)),
        outboxRelayedPerSec: Number((this.counters.outboxEventsRelayed / elapsedSeconds).toFixed(2))
      },
      uptimeSec: elapsedSeconds
    };
  }
}

export const workerMetrics = new WorkerMetrics();
