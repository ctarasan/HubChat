import test from "node:test";
import assert from "node:assert/strict";
import { registerWorkerLoop } from "./workerLoopLiveness.js";
import { superviseWorkerLoop } from "./workerLoopSupervisor.js";
import { forceWorkerShutdownForTests } from "./workerShutdownCoordinator.js";

test.afterEach(() => {
  forceWorkerShutdownForTests(false);
});

test("supervisor restarts loop after synchronous throw", async () => {
  registerWorkerLoop("inbound", 200);
  let runs = 0;
  superviseWorkerLoop({
    loopKey: "inbound",
    label: "test",
    run: async () => {
      runs += 1;
      if (runs === 1) throw new Error("boom");
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 120_000);
        t.unref();
      });
    }
  });
  await new Promise((r) => setTimeout(r, 3500));
  assert.ok(runs >= 2);
});

test("supervisor exits without backoff restart when shutdown is requested after run returns", async () => {
  registerWorkerLoop("inbound", 200);
  let runs = 0;
  superviseWorkerLoop({
    loopKey: "inbound",
    label: "shutdown-test",
    run: async () => {
      runs += 1;
      await new Promise<void>((r) => setTimeout(r, 15));
      forceWorkerShutdownForTests(true);
    }
  });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(runs, 1);
});
