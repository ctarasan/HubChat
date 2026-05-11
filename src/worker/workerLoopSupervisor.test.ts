import test from "node:test";
import assert from "node:assert/strict";
import { registerWorkerLoop } from "./workerLoopLiveness.js";
import { superviseWorkerLoop } from "./workerLoopSupervisor.js";

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
