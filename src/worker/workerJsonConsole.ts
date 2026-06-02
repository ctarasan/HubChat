import { serializeError } from "../lib/serializeError.js";

/** One-line JSON on stdout — many hosts only surface plain console text, not pino object fields. */
export function emitWorkerStdoutJson(payload: Record<string, unknown>): void {
  console.info(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
}

/** One-line JSON on stderr — use for loop/supervisor failures so they appear in error-focused log views. */
export function emitWorkerStderrJson(payload: Record<string, unknown>): void {
  console.error(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
}

export function emitWorkerLoopStarted(loop: string, fields: Record<string, unknown>): void {
  emitWorkerStdoutJson({ event: "worker_loop_started", loop, ...fields });
}

export function emitWorkerLoopClaimResult(loop: string, claimedCount: number): void {
  emitWorkerStdoutJson({ event: "worker_loop_claim_result", loop, claimedCount });
}

export function emitWorkerLoopPoll(loop: string, fields: Record<string, unknown>): void {
  emitWorkerStdoutJson({ event: "worker_loop_poll", loop, ...fields });
}

export function emitWorkerLoopError(
  loop: "inbound" | "outbound" | "outboxRelay" | "observability" | "profileAvatarCache",
  err: unknown,
  fields: Record<string, unknown>
): void {
  emitWorkerStderrJson({
    event: "worker_loop_error",
    loop,
    error: serializeError(err),
    ...fields
  });
}

export function emitWorkerLoopExited(loop: string, fields: Record<string, unknown>): void {
  emitWorkerStderrJson({ event: "worker_loop_exited", loop, ...fields });
}
