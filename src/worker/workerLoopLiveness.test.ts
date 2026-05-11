import test from "node:test";
import assert from "node:assert/strict";
import {
  isWorkerReadinessHealthy,
  registerWorkerLoop,
  touchLoopProgress
} from "./workerLoopLiveness.js";

test("readiness is unhealthy when outbound loop progress is stale", () => {
  let mocked = 1_700_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    registerWorkerLoop("outbound", 200);
    mocked += 61_000;
    const { ok, unhealthyLoops } = isWorkerReadinessHealthy();
    assert.equal(ok, false);
    assert.ok(unhealthyLoops.includes("outbound"));
  } finally {
    Date.now = orig;
  }
});

test("readiness is healthy after touchLoopProgress", () => {
  let mocked = 1_700_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    registerWorkerLoop("outbound", 200);
    mocked += 61_000;
    touchLoopProgress("outbound");
    const { ok, unhealthyLoops } = isWorkerReadinessHealthy();
    assert.equal(ok, true);
    assert.equal(unhealthyLoops.length, 0);
  } finally {
    Date.now = orig;
  }
});
