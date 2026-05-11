import pino from "pino";
import { serializeError } from "../lib/serializeError.js";
import type { WorkerLoopName } from "./workerLoopLiveness.js";
import { recordLoopError, recordLoopRestart } from "./workerLoopLiveness.js";

const logger = pino({ name: "worker-supervisor" });

export function superviseWorkerLoop(input: {
  loopKey: WorkerLoopName;
  label: string;
  run: () => Promise<void>;
}): void {
  void (async () => {
    let restartGeneration = 0;
    while (true) {
      try {
        await input.run();
        logger.error(
          {
            event: "worker_loop_exited",
            loop: input.loopKey,
            label: input.label,
            restartGeneration
          },
          "Worker loop returned unexpectedly without throwing"
        );
      } catch (error) {
        recordLoopError(input.loopKey, error);
        logger.error(
          {
            event: "worker_loop_error",
            loop: input.loopKey,
            label: input.label,
            error: serializeError(error),
            restartGeneration
          },
          "Worker loop crashed; restarting after backoff"
        );
      }
      restartGeneration += 1;
      recordLoopRestart(input.loopKey);
      const backoffMs = Math.min(30_000, 1000 * 2 ** Math.min(restartGeneration, 5));
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  })();
}
