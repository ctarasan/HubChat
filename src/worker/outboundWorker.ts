import pino from "pino";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { QueuePort } from "../domain/ports.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { workerMetrics } from "./workerMetrics.js";

const logger = pino({ name: "outbound-worker" });

interface OutboundWorkerConfig {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
}

export class OutboundWorker {
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly queue: QueuePort,
    private readonly useCase: SendOutboundMessageUseCase,
    config?: OutboundWorkerConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 15);
    this.concurrency = Math.max(1, config?.concurrency ?? 5);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    const jobs = await this.queue.claimBatch<OutboundMessageRequestedPayload>("message.outbound.requested", {
      limit: this.batchSize
    });
    if (jobs.length === 0) return;

    let cursor = 0;
    let processed = 0;
    let failed = 0;
    let deadLettered = 0;

    const workers = Array.from({ length: Math.min(this.concurrency, jobs.length) }, async () => {
      while (true) {
        const currentIndex = cursor++;
        if (currentIndex >= jobs.length) break;
        const job = jobs[currentIndex];

        try {
          await this.useCase.execute(job.payload);
          await this.queue.markDone(job.id);
          processed += 1;
          workerMetrics.incr("queueJobsProcessed");
          logger.info(
            {
              topic: "message.outbound.requested",
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              conversationId: job.payload.conversationId,
              messageId: job.payload.messageId,
              channel: job.payload.channel
            },
            "Outbound message sent"
          );
        } catch (error) {
          failed += 1;
          const failure = await this.queue.markFailed(job, error);
          workerMetrics.incr("queueJobsFailed");
          workerMetrics.incr("queueJobsRetried");
          if (failure.deadLetter) deadLettered += 1;
          if (failure.deadLetter) workerMetrics.incr("queueJobsDeadLettered");
          logger.error(
            {
              topic: "message.outbound.requested",
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              conversationId: job.payload.conversationId,
              messageId: job.payload.messageId,
              retryCount: failure.retryCount,
              deadLetter: failure.deadLetter,
              nextAvailableAt: failure.nextAvailableAt,
              err: error instanceof Error ? { name: error.name, message: error.message } : String(error)
            },
            "Outbound message failed"
          );
        }
      }
    });

    await Promise.all(workers);
    logger.info(
      {
        topic: "message.outbound.requested",
        claimed: jobs.length,
        processed,
        failed,
        deadLettered,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        durationMs: Date.now() - startedAt
      },
      "Outbound batch completed"
    );
  }

  async runForever(): Promise<void> {
    while (true) {
      try {
        await this.runOnce();
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? { message: error.message, name: error.name } : String(error) },
          "Outbound worker loop failed"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
