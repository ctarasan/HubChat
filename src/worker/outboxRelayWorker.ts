import pino from "pino";
import type { QueuePort, OutboxPort } from "../domain/ports.js";
import { workerMetrics } from "./workerMetrics.js";

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
}

export class OutboxRelayWorker {
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly topic?: string;

  constructor(
    private readonly outbox: OutboxPort,
    private readonly queue: QueuePort,
    config?: OutboxRelayConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 50);
    this.concurrency = Math.max(1, config?.concurrency ?? 10);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
    this.topic = config?.topic;
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    const events = await this.outbox.claimBatch<Record<string, unknown>>({
      limit: this.batchSize,
      topic: this.topic
    });
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
              err: error instanceof Error ? { name: error.name, message: error.message } : String(error)
            },
            "Outbox relay failed"
          );
        }
      }
    });

    await Promise.all(workers);
    logger.info(
      {
        topic: this.topic ?? "ALL",
        claimed: events.length,
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
    while (true) {
      try {
        await this.runOnce();
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? { message: error.message, name: error.name } : String(error) },
          "Outbox relay loop failed"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
