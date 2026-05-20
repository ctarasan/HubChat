import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCollectedAt,
  formatHealthReason,
  formatLagMs,
  healthLevelLabel,
  mapOpsFetchError,
  parseOpsRuntimeResponse
} from "./opsRuntimeModel.js";

const validPayload = {
  data: {
    queue: { depth: 60, lagMs: 120_000 },
    outbox: { depth: 2, lagMs: 400 },
    collectedAt: "2026-05-20T12:00:00.000Z",
    health: { level: "warn", reasons: ["queue_depth_warn:60"] },
    thresholds: {
      queueDepthWarn: 50,
      queueDepthCritical: 200,
      queueLagMsWarn: 300_000,
      queueLagMsCritical: 900_000,
      outboxDepthWarn: 50,
      outboxDepthCritical: 200,
      outboxLagMsWarn: 300_000,
      outboxLagMsCritical: 900_000
    }
  }
};

test("parseOpsRuntimeResponse accepts valid payload", () => {
  const r = parseOpsRuntimeResponse(validPayload);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.queue.depth, 60);
  assert.equal(r.data.health.level, "warn");
  assert.deepEqual(r.data.health.reasons, ["queue_depth_warn:60"]);
});

test("parseOpsRuntimeResponse rejects missing queue", () => {
  const r = parseOpsRuntimeResponse({ data: { ...validPayload.data, queue: null } });
  assert.equal(r.ok, false);
});

test("parseOpsRuntimeResponse rejects invalid health level", () => {
  const r = parseOpsRuntimeResponse({
    data: { ...validPayload.data, health: { level: "unknown", reasons: [] } }
  });
  assert.equal(r.ok, false);
});

test("formatLagMs formats sub-minute and longer durations", () => {
  assert.equal(formatLagMs(450), "450 ms");
  assert.equal(formatLagMs(5000), "5.0 s");
  assert.equal(formatLagMs(90_000), "1.5 min");
  assert.equal(formatLagMs(7_200_000), "2.0 h");
});

test("formatHealthReason humanizes tokens", () => {
  assert.match(formatHealthReason("queue_depth_warn:60"), /queue depth warn/i);
  assert.match(formatHealthReason("queue_depth_warn:60"), /60/);
});

test("mapOpsFetchError maps auth errors", () => {
  assert.match(mapOpsFetchError(401, {}), /sign in/i);
  assert.match(mapOpsFetchError(403, {}), /admin/i);
});

test("healthLevelLabel and formatCollectedAt", () => {
  assert.equal(healthLevelLabel("critical"), "Critical");
  const formatted = formatCollectedAt("2026-05-20T12:00:00.000Z");
  assert.notEqual(formatted, "2026-05-20T12:00:00.000Z");
  assert.ok(formatted.length > 0);
});
