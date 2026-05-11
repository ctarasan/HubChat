import pino from "pino";
import { emitWorkerStderrJson, emitWorkerStdoutJson } from "./workerJsonConsole.js";
import { serializeError } from "../lib/serializeError.js";

const logger = pino({ name: "worker-shutdown" });

let shuttingDown = false;
let shutdownSignal: string | null = null;
let shutdownHandlersInstalled = false;

export function isWorkerShuttingDown(): boolean {
  return shuttingDown;
}

export function getWorkerShutdownSignal(): string | null {
  return shutdownSignal;
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Unit tests only: flip shutdown without installing signal handlers. */
export function forceWorkerShutdownForTests(value: boolean): void {
  shuttingDown = value;
  if (!value) shutdownSignal = null;
}

export interface WorkerShutdownOptions {
  graceMs: number;
  getOutboundActiveCount: () => number;
}

/**
 * Idempotent: first signal wins. Subsequent signals are ignored until process exits.
 */
export function registerWorkerShutdownHandlers(opts: WorkerShutdownOptions): void {
  if (shutdownHandlersInstalled) return;
  shutdownHandlersInstalled = true;

  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownSignal = signal;

    emitWorkerStdoutJson({
      event: "worker_shutdown_started",
      signal,
      graceMs: opts.graceMs,
      pid: process.pid
    });
    logger.info({ event: "worker_shutdown_started", signal, graceMs: opts.graceMs }, "worker_shutdown_started");

    void (async () => {
      const started = Date.now();
      emitWorkerStdoutJson({
        event: "worker_shutdown_waiting_for_inflight",
        outboundActiveCount: opts.getOutboundActiveCount(),
        graceMs: opts.graceMs,
        pid: process.pid
      });
      logger.info(
        {
          event: "worker_shutdown_waiting_for_inflight",
          outboundActiveCount: opts.getOutboundActiveCount()
        },
        "worker_shutdown_waiting_for_inflight"
      );

      while (Date.now() - started < opts.graceMs) {
        if (opts.getOutboundActiveCount() <= 0) break;
        await sleepMs(100);
      }

      const remaining = opts.getOutboundActiveCount();
      if (remaining > 0) {
        emitWorkerStderrJson({
          event: "worker_shutdown_inflight_timeout",
          outboundActiveCount: remaining,
          graceMs: opts.graceMs,
          waitedMs: Date.now() - started,
          pid: process.pid
        });
        logger.error(
          {
            event: "worker_shutdown_inflight_timeout",
            outboundActiveCount: remaining,
            graceMs: opts.graceMs
          },
          "worker_shutdown_inflight_timeout"
        );
        emitWorkerStdoutJson({
          event: "worker_shutdown_complete",
          outcome: "timeout",
          outboundActiveCountRemaining: remaining,
          pid: process.pid
        });
        logger.error({ event: "worker_shutdown_complete", outcome: "timeout" }, "worker_shutdown_complete");
        process.exit(1);
        return;
      }

      emitWorkerStdoutJson({
        event: "worker_shutdown_complete",
        outcome: "ok",
        waitedMs: Date.now() - started,
        pid: process.pid
      });
      logger.info({ event: "worker_shutdown_complete", outcome: "ok" }, "worker_shutdown_complete");
      process.exit(0);
    })().catch((err: unknown) => {
      emitWorkerStderrJson({
        event: "worker_shutdown_failed",
        error: serializeError(err),
        pid: process.pid
      });
      process.exit(1);
    });
  };

  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
}
