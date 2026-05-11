import { serializeError } from "../lib/serializeError.js";

function logProcessFatal(event: string, reason: unknown): void {
  const line = JSON.stringify({
    level: "error",
    event,
    worker: "hub-worker",
    pid: process.pid,
    error: serializeError(reason),
    time: new Date().toISOString()
  });
  console.error(line);
}

let registered = false;

export function registerWorkerProcessHandlers(): void {
  if (registered) return;
  registered = true;

  process.on("unhandledRejection", (reason: unknown) => {
    logProcessFatal("unhandledRejection", reason);
  });

  process.on("uncaughtException", (err: unknown) => {
    logProcessFatal("uncaughtException", err);
  });
}

registerWorkerProcessHandlers();
