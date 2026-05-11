import test from "node:test";
import assert from "node:assert/strict";
import {
  markLoopStarted,
  recordLoopClaimResult,
  recordLoopPoll,
  registerWorkerLoop,
  resetWorkerLoopSnapshotsForTests,
  touchLoopProgress
} from "./workerLoopLiveness.js";
import { buildWorkerHealthReadiness, computeWorkerDeploymentStatus } from "./workerHealthReadiness.js";
import { markWorkerBootChecksOkForTests, resetWorkerBootGateForTests } from "./workerBootGate.js";
import { forceWorkerShutdownForTests } from "./workerShutdownCoordinator.js";

test.afterEach(() => {
  resetWorkerLoopSnapshotsForTests();
  resetWorkerBootGateForTests();
  forceWorkerShutdownForTests(false);
});

test("deployment status is starting before outbound first claim (503 body)", () => {
  markWorkerBootChecksOkForTests();
  registerWorkerLoop("outbound", 200);
  const r = buildWorkerHealthReadiness();
  assert.equal(r.ok, false);
  assert.equal((r.body as { status: string }).status, "starting");
});

test("deployment status becomes healthy after outbound first poll+claim and peer loops are fresh", () => {
  let mocked = 2_000_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    markWorkerBootChecksOkForTests();
    for (const name of ["outbound", "inbound", "outboxRelay", "observability"] as const) {
      registerWorkerLoop(name, name === "observability" ? 5000 : 200);
      markLoopStarted(name);
      recordLoopPoll(name);
      if (name !== "observability") {
        recordLoopClaimResult(name, 0);
      }
      touchLoopProgress(name);
    }
    const r = buildWorkerHealthReadiness();
    assert.equal(r.ok, true);
    assert.equal((r.body as { status: string }).status, "healthy");
    assert.equal((r.body as { queueTopicOutbound: string }).queueTopicOutbound, "message.outbound.requested");
    const loops = (r.body as { loops: { outbound: { ready: boolean } } }).loops;
    assert.equal(loops.outbound.ready, true);
  } finally {
    Date.now = orig;
  }
});

test("deployment status unhealthy when outbound progress stalls after it was live", () => {
  let mocked = 2_100_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    markWorkerBootChecksOkForTests();
    for (const name of ["outbound", "inbound", "outboxRelay", "observability"] as const) {
      registerWorkerLoop(name, name === "observability" ? 5000 : 200);
      markLoopStarted(name);
      recordLoopPoll(name);
      if (name !== "observability") recordLoopClaimResult(name, 0);
      touchLoopProgress(name);
    }
    mocked += 70_000;
    const s = computeWorkerDeploymentStatus(mocked);
    assert.equal(s.status, "unhealthy");
    assert.equal(s.httpOk, false);
    assert.equal(s.outboundStalled, true);
  } finally {
    Date.now = orig;
  }
});

test("stale started loops appear in unhealthyLoops list", () => {
  let mocked = 2_200_000_000_000;
  const orig = Date.now;
  Date.now = () => mocked;
  try {
    markWorkerBootChecksOkForTests();
    registerWorkerLoop("outbound", 200);
    markLoopStarted("outbound");
    recordLoopPoll("outbound");
    recordLoopClaimResult("outbound", 0);
    touchLoopProgress("outbound");

    registerWorkerLoop("inbound", 200);
    markLoopStarted("inbound");
    recordLoopPoll("inbound");
    recordLoopClaimResult("inbound", 0);
    touchLoopProgress("inbound");

    mocked += 70_000;
    const r = buildWorkerHealthReadiness();
    assert.equal((r.body as { status: string }).status, "unhealthy");
    const loops = (r.body as { unhealthyLoops: string[] }).unhealthyLoops;
    assert.ok(loops.includes("outbound"));
    assert.ok(loops.includes("inbound"));
  } finally {
    Date.now = orig;
  }
});
