import pino from "pino";
import { serializeError } from "../lib/serializeError.js";
import type { WorkerLoopName } from "./workerLoopLiveness.js";
import { recordLoopError, recordLoopRestart } from "./workerLoopLiveness.js";
import { emitWorkerLoopExited, emitWorkerStderrJson } from "./workerJsonConsole.js";
import { isWorkerShuttingDown } from "./workerShutdownCoordinator.js";

const logger = pino({ name: "worker-supervisor" });

export function superviseWorkerLoop(input: {
  loopKey: WorkerLoopName;
  label: string;
  run: () => Promise<void>;
}): void {
  void (async () => {
    let restartGeneration = 0;
    while (true) {
      if (isWorkerShuttingDown()) return;
      try {
        await input.run();
        if (isWorkerShuttingDown()) return;
        emitWorkerLoopExited(input.loopKey, {
          label: input.label,
          restartGeneration,
          reason: "run_returned"
        });
        logger.error(
          {
            event: "worker_loop_exited",
            loop: input.loopKey,
            label: input.label,
            restartGeneration
          },
          "supervisor_loop_exited"
        );
      } catch (error) {
        if (isWorkerShuttingDown()) return;
        recordLoopError(input.loopKey, error);
        emitWorkerStderrJson({
          event: "worker_loop_error",
          loop: input.loopKey,
          source: "supervisor",
          label: input.label,
          error: serializeError(error),
          restartGeneration
        });
        logger.error(
          {
            event: "worker_loop_error",
            loop: input.loopKey,
            label: input.label,
            error: serializeError(error),
            restartGeneration
          },
          "supervisor_loop_crashed"
        );
      }
      if (isWorkerShuttingDown()) return;
      restartGeneration += 1;
      recordLoopRestart(input.loopKey);
      const backoffMs = Math.min(30_000, 1000 * 2 ** Math.min(restartGeneration, 5));
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  })();
}
