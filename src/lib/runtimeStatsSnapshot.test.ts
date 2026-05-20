import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQueueOutboxRuntimeSnapshot,
  classifyQueueOutboxHealth,
  firstRpcRow,
  normalizeRpcDepthLagRow
} from "./runtimeStatsSnapshot.js";

test("normalizeRpcDepthLagRow coerces depth and lag_ms", () => {
  assert.deepEqual(normalizeRpcDepthLagRow({ depth: "12", lag_ms: 1500 }), { depth: 12, lagMs: 1500 });
  assert.deepEqual(normalizeRpcDepthLagRow(null), { depth: 0, lagMs: 0 });
  assert.deepEqual(normalizeRpcDepthLagRow({ depth: -1, lag_ms: NaN }), { depth: 0, lagMs: 0 });
});

test("firstRpcRow returns first array element or object", () => {
  assert.deepEqual(firstRpcRow([{ depth: 1 }]), { depth: 1 });
  assert.deepEqual(firstRpcRow({ depth: 2 }), { depth: 2 });
});

test("buildQueueOutboxRuntimeSnapshot maps queue and outbox rows", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 3, lag_ms: 100 }, { depth: 1, lag_ms: 50 }, "2026-01-01T00:00:00.000Z");
  assert.equal(snap.collectedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(snap.queue, { depth: 3, lagMs: 100 });
  assert.deepEqual(snap.outbox, { depth: 1, lagMs: 50 });
});

test("classifyQueueOutboxHealth returns ok for low depth/lag", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 0, lag_ms: 0 }, { depth: 0, lag_ms: 0 });
  const h = classifyQueueOutboxHealth(snap);
  assert.equal(h.level, "ok");
  assert.equal(h.reasons.length, 0);
});

test("classifyQueueOutboxHealth escalates on depth and lag thresholds", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 60, lag_ms: 0 }, { depth: 0, lag_ms: 0 });
  assert.equal(classifyQueueOutboxHealth(snap).level, "warn");
  const critical = buildQueueOutboxRuntimeSnapshot({ depth: 250, lag_ms: 400_000 }, { depth: 0, lag_ms: 0 });
  assert.equal(classifyQueueOutboxHealth(critical).level, "critical");
  assert.ok(classifyQueueOutboxHealth(critical).reasons.some((r) => r.startsWith("queue_depth_critical")));
});
