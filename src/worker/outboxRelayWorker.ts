import pino from "pino";
import type { QueuePort, OutboxPort } from "../domain/ports.js";
import { workerMetrics } from "./workerMetrics.js";
import { serializeError } from "../lib/serializeError.js";
import { withTimeout } from "../lib/asyncTimeout.js";
import {
  markLoopStarted,
  recordLoopClaimResult,
  recordLoopError,
  recordLoopPoll,
  touchLoopProgress
} from "./workerLoopLiveness.js";
import { isWorkerShuttingDown } from "./workerShutdownCoordinator.js";
import {
  emitWorkerLoopClaimResult,
  emitWorkerLoopError,
  emitWorkerLoopPoll,
  emitWorkerLoopStarted
} from "./workerJsonConsole.js";

const logger = pino({ name: "outbox-relay-worker" });

function isDuplicateError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: string }).code;
    const message = String((error as { message?: unknown }).message ?? "");
    return code === "23505" || message.toLowerCase().includes("duplicate");
  }
  return String(error).toLowerCase().includes("duplicate");
}

interface OutboxRelayConfig {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
  topic?: string;
  claimTimeoutMs?: number;
  pollLogIntervalMs?: number;
  heartbeatMs?: number;
}

export class OutboxRelayWorker {
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly topic?: string;
  private readonly claimTimeoutMs: number;
  private readonly pollLogIntervalMs: number;
  private readonly heartbeatMs: number;
  private lastPollStructuredLogAt = 0;
  private lastClaimResultLogAt = 0;
  private loopStartedLogged = false;

  constructor(
    private readonly outbox: OutboxPort,
    private readonly queue: QueuePort,
    config?: OutboxRelayConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 50);
    this.concurrency = Math.max(1, config?.concurrency ?? 10);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
    this.topic = config?.topic;
    this.claimTimeoutMs = Math.max(1000, config?.claimTimeoutMs ?? 45_000);
    this.pollLogIntervalMs = Math.max(1000, config?.pollLogIntervalMs ?? 30_000);
    this.heartbeatMs = Math.max(1000, config?.heartbeatMs ?? 15_000);
  }

  private relayTopicLabel(): string {
    return this.topic ?? "ALL";
  }

  private maybeLogWorkerLoopPoll(): void {
    const now = Date.now();
    if (now - this.lastPollStructuredLogAt < this.pollLogIntervalMs) return;
    this.lastPollStructuredLogAt = now;
    const lastPollAt = new Date(now).toISOString();
    const topic = this.relayTopicLabel();
    emitWorkerLoopPoll("outboxRelay", {
      topic,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      concurrency: this.concurrency,
      lastPollAt
    });
    logger.info(
      {
        event: "worker_loop_poll",
        loop: "outboxRelay",
        topic,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        lastPollAt
      },
      "outbox_relay_poll"
    );
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    recordLoopPoll("outboxRelay");
    this.maybeLogWorkerLoopPoll();

    const events = await withTimeout(
      this.outbox.claimBatch<Record<string, unknown>>({
        limit: this.batchSize,
        topic: this.topic
      }),
      this.claimTimeoutMs,
      "outbox_claim_batch"
    );
    recordLoopClaimResult("outboxRelay", events.length);
    const nowAfterClaim = Date.now();
    if (events.length > 0 || nowAfterClaim - this.lastClaimResultLogAt >= this.pollLogIntervalMs) {
      this.lastClaimResultLogAt = nowAfterClaim;
      emitWorkerLoopClaimResult("outboxRelay", events.length);
      logger.info(
        { event: "worker_loop_claim_result", loop: "outboxRelay", claimedCount: events.length },
        "outbox_relay_claim"
      );
    }

    if (events.length === 0) return;

    let cursor = 0;
    let relayed = 0;
    let failed = 0;
    let deadLettered = 0;

    const workers = Array.from({ length: Math.min(this.concurrency, events.length) }, async () => {
      while (true) {
        const currentIndex = cursor++;
        if (currentIndex >= events.length) break;
        const event = events[currentIndex];

        try {
          try {
            await this.queue.enqueue(event.topic, event.payload, {
              tenantId: event.tenantId,
              idempotencyKey: event.idempotencyKey
            });
          } catch (error) {
            // Recoverable relay case: queue already has this idempotency key (e.g. crash after enqueue before outbox ack).
            if (!isDuplicateError(error)) throw error;
          }
          await this.outbox.markDispatched(event.id);
          relayed += 1;
          workerMetrics.incr("outboxEventsRelayed");
        } catch (error) {
          failed += 1;
          workerMetrics.incr("outboxEventsFailed");
          const failure = await this.outbox.markFailed(event.id, {
            attemptCount: event.attemptCount,
            maxAttempts: event.maxAttempts,
            error
          });
          if (failure.deadLetter) deadLettered += 1;
          if (failure.deadLetter) workerMetrics.incr("outboxEventsDeadLettered");
          logger.error(
            {
              outboxEventId: event.id,
              topic: event.topic,
              tenantId: event.tenantId,
              attemptCount: failure.attemptCount,
              deadLetter: failure.deadLetter,
              nextAvailableAt: failure.nextAvailableAt,
              error: serializeError(error)
            },
            "Outbox relay failed"
          );
        }
      }
    });

    const hb = setInterval(() => {
      touchLoopProgress("outboxRelay");
    }, this.heartbeatMs);
    try {
      await Promise.all(workers);
    } finally {
      clearInterval(hb);
    }
    touchLoopProgress("outboxRelay");

    logger.info(
      {
        topic: this.relayTopicLabel(),
        relayed,
        failed,
        deadLettered,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        durationMs: Date.now() - startedAt
      },
      "Outbox relay batch completed"
    );
  }

  async runForever(): Promise<void> {
    while (!isWorkerShuttingDown()) {
      if (!this.loopStartedLogged) {
        this.loopStartedLogged = true;
        const topic = this.relayTopicLabel();
        markLoopStarted("outboxRelay");
        emitWorkerLoopStarted("outboxRelay", {
          topic,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          claimTimeoutMs: this.claimTimeoutMs
        });
        logger.info(
          {
            event: "worker_loop_started",
            loop: "outboxRelay",
            topic,
            pollIntervalMs: this.pollIntervalMs,
            batchSize: this.batchSize,
            concurrency: this.concurrency,
            claimTimeoutMs: this.claimTimeoutMs
          },
          "outbox_relay_loop_started"
        );
      }
      try {
        await this.runOnce();
      } catch (error) {
        recordLoopError("outboxRelay", error);
        const topic = this.relayTopicLabel();
        emitWorkerLoopError("outboxRelay", error, {
          topic,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          pid: process.pid
        });
        logger.error(
          {
            event: "worker_loop_error",
            loop: "outboxRelay",
            error: serializeError(error),
            worker: "outbox-relay-worker",
            pid: process.pid
          },
          "outbox_relay_iteration_error"
        );
      }
      if (isWorkerShuttingDown()) break;
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
