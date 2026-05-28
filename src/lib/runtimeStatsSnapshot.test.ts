import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQueueOutboxRuntimeSnapshot,
  classifyQueueOutboxHealth,
  emptyOpsLifecycleCounts,
  fetchOpsQueueOutboxDetails,
  firstRpcRow,
  normalizeOpsCount,
  normalizeRpcDepthLagRow,
  OPS_QUEUE_INBOUND_TOPIC,
  OPS_QUEUE_OUTBOUND_TOPIC,
  staleUpdatedAtCutoffIso
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

test("classifyQueueOutboxHealth escalates stale processing to critical", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 0, lag_ms: 0 }, { depth: 0, lag_ms: 0 });
  const h = classifyQueueOutboxHealth(snap, undefined, {
    queueDetail: {
      inbound: { ...emptyOpsLifecycleCounts(), processingStale: 2 },
      outbound: emptyOpsLifecycleCounts()
    },
    outboxDetail: emptyOpsLifecycleCounts()
  });
  assert.equal(h.level, "critical");
  assert.ok(h.reasons.some((r) => r.startsWith("queue_inbound_processing_stale:")));
});

test("classifyQueueOutboxHealth escalates dead letter to warn", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 0, lag_ms: 0 }, { depth: 0, lag_ms: 0 });
  const h = classifyQueueOutboxHealth(snap, undefined, {
    queueDetail: {
      inbound: emptyOpsLifecycleCounts(),
      outbound: { ...emptyOpsLifecycleCounts(), deadLetter: 1 }
    },
    outboxDetail: emptyOpsLifecycleCounts()
  });
  assert.equal(h.level, "warn");
  assert.ok(h.reasons.some((r) => r.startsWith("queue_outbound_dead_letter:")));
});

test("classifyQueueOutboxHealth stale wins over dead letter severity", () => {
  const snap = buildQueueOutboxRuntimeSnapshot({ depth: 0, lag_ms: 0 }, { depth: 0, lag_ms: 0 });
  const h = classifyQueueOutboxHealth(snap, undefined, {
    queueDetail: {
      inbound: { ...emptyOpsLifecycleCounts(), deadLetter: 3 },
      outbound: emptyOpsLifecycleCounts()
    },
    outboxDetail: { ...emptyOpsLifecycleCounts(), processingStale: 1 }
  });
  assert.equal(h.level, "critical");
});

test("normalizeOpsCount and staleUpdatedAtCutoffIso", () => {
  assert.equal(normalizeOpsCount("4.9"), 4);
  assert.equal(normalizeOpsCount(-1), 0);
  const cutoff = staleUpdatedAtCutoffIso(300, Date.parse("2026-01-01T00:05:00.000Z"));
  assert.equal(cutoff, "2026-01-01T00:00:00.000Z");
});

test("fetchOpsQueueOutboxDetails issues head counts per topic and status", async () => {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      return {
        select(_cols: string, _opts: { count: "exact"; head: true }) {
          const filters: string[] = [`table=${table}`];
          const query = {
            eq(column: string, value: string) {
              filters.push(`${column}=${value}`);
              return query;
            },
            lte(column: string, value: string) {
              filters.push(`${column}<=${value}`);
              return query;
            },
            lt(column: string, value: string) {
              filters.push(`${column}<${value}`);
              return query;
            },
            async then(resolve: (v: { count: number; error: null }) => void) {
              calls.push(filters.join("|"));
              resolve({ count: filters.some((f) => f.includes("DEAD_LETTER")) ? 1 : 0, error: null });
            }
          };
          return query;
        }
      };
    }
  };

  const details = await fetchOpsQueueOutboxDetails(client as any, "2026-01-01T00:10:00.000Z");
  assert.ok(calls.some((c) => c.includes(`topic=${OPS_QUEUE_INBOUND_TOPIC}`)));
  assert.ok(calls.some((c) => c.includes(`topic=${OPS_QUEUE_OUTBOUND_TOPIC}`)));
  assert.equal(details.queueDetail.inbound.deadLetter, 1);
  assert.equal(details.outboxDetail.pending, 0);
});
