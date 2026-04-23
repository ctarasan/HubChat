import test from "node:test";
import assert from "node:assert/strict";
import { WorkerMetrics } from "./workerMetrics.js";

test("worker metrics counters and gauges snapshot", () => {
  const m = new WorkerMetrics();
  m.incr("queueJobsProcessed", 5);
  m.incr("queueJobsFailed", 2);
  m.observeProviderLatency(40);
  m.observeProviderLatency(90);
  m.setQueueDepth(10);
  m.setQueueLagMs(1200);
  m.setOutboxDepth(3);
  m.setOutboxLagMs(300);

  const snap = m.snapshot();
  assert.equal(snap.counters.queueJobsProcessed, 5);
  assert.equal(snap.counters.queueJobsFailed, 2);
  assert.equal(snap.gauges.queueDepth, 10);
  assert.equal(snap.gauges.outboxDepth, 3);
  assert.equal(snap.gauges.providerLatencyMsP95 >= 40, true);
});
