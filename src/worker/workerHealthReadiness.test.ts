import test from "node:test";
import assert from "node:assert/strict";
import { registerWorkerLoop } from "./workerLoopLiveness.js";
import { buildWorkerHealthReadiness } from "./workerHealthReadiness.js";

test("buildWorkerHealthReadiness returns ok false when outbound is stale", () => {
  let mocked = 1_800_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    registerWorkerLoop("outbound", 200);
    mocked += 65_000;
    const r = buildWorkerHealthReadiness();
    assert.equal(r.ok, false);
    assert.equal((r.body as { ok: boolean }).ok, false);
    const loops = (r.body as { unhealthyLoops: string[] }).unhealthyLoops;
    assert.ok(loops.includes("outbound"));
    const outbound = (r.body as { outbound: { lastPollAt: number; restartCount: number } }).outbound;
    assert.ok(outbound);
    assert.equal(typeof outbound.lastPollAt, "number");
    assert.equal(typeof outbound.restartCount, "number");
  } finally {
    Date.now = orig;
  }
});
