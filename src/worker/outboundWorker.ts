import pino from "pino";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { MessageRepository, QueuePort } from "../domain/ports.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { workerMetrics } from "./workerMetrics.js";
import { serializeError } from "../lib/serializeError.js";
import {
  RetryableOutboundDeliveryError,
  resolveRetryableDeadLetterFailurePayload,
  TerminalOutboundDeliveryError
} from "../lib/outboundDeliveryError.js";
import { withTimeout } from "../lib/asyncTimeout.js";
import {
  decrementOutboundActiveJobs,
  incrementOutboundActiveJobs,
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

const logger = pino({ name: "outbound-worker" });

export const OUTBOUND_QUEUE_TOPIC = "message.outbound.requested" as const;

interface OutboundWorkerConfig {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
  claimTimeoutMs?: number;
  runOnceTimeoutMs?: number;
  pollLogIntervalMs?: number;
  heartbeatMs?: number;
  /** Used to persist final message failure when a retryable job reaches dead-letter. */
  messageRepository?: MessageRepository;
}

export class OutboundWorker {
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly claimTimeoutMs: number;
  private readonly runOnceTimeoutMs: number;
  private readonly pollLogIntervalMs: number;
  private readonly heartbeatMs: number;
  private readonly messageRepository?: MessageRepository;
  private lastPollStructuredLogAt = 0;
  private lastClaimResultLogAt = 0;
  private loopStartedLogged = false;

  constructor(
    private readonly queue: QueuePort,
    private readonly useCase: SendOutboundMessageUseCase,
    config?: OutboundWorkerConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 15);
    this.concurrency = Math.max(1, config?.concurrency ?? 5);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
    this.claimTimeoutMs = Math.max(1000, config?.claimTimeoutMs ?? 45_000);
    this.runOnceTimeoutMs = Math.max(5000, config?.runOnceTimeoutMs ?? 60_000);
    this.pollLogIntervalMs = Math.max(1000, config?.pollLogIntervalMs ?? 30_000);
    this.heartbeatMs = Math.max(1000, config?.heartbeatMs ?? 15_000);
    this.messageRepository = config?.messageRepository;
  }

  private maybeLogWorkerLoopPoll(): void {
    const now = Date.now();
    if (now - this.lastPollStructuredLogAt < this.pollLogIntervalMs) return;
    this.lastPollStructuredLogAt = now;
    const lastPollAt = new Date(now).toISOString();
    emitWorkerLoopPoll("outbound", {
      topic: OUTBOUND_QUEUE_TOPIC,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      concurrency: this.concurrency,
      lastPollAt
    });
    logger.info(
      {
        event: "worker_loop_poll",
        loop: "outbound",
        topic: OUTBOUND_QUEUE_TOPIC,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        lastPollAt
      },
      "outbound_poll"
    );
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    recordLoopPoll("outbound");
    this.maybeLogWorkerLoopPoll();

    const jobs = await withTimeout(
      this.queue.claimBatch<OutboundMessageRequestedPayload>(OUTBOUND_QUEUE_TOPIC, {
        limit: this.batchSize
      }),
      this.claimTimeoutMs,
      "outbound_claim_batch"
    );
    recordLoopClaimResult("outbound", jobs.length);
    const nowAfterClaim = Date.now();
    if (
      jobs.length > 0 ||
      nowAfterClaim - this.lastClaimResultLogAt >= this.pollLogIntervalMs
    ) {
      this.lastClaimResultLogAt = nowAfterClaim;
      emitWorkerLoopClaimResult("outbound", jobs.length);
      logger.info(
        { event: "worker_loop_claim_result", loop: "outbound", claimedCount: jobs.length },
        "outbound_claim"
      );
    }

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

        incrementOutboundActiveJobs();
        try {
          await this.useCase.execute(job.payload);
          await this.queue.markDone(job.id);
          processed += 1;
          workerMetrics.incr("queueJobsProcessed");
          logger.info(
            {
              topic: OUTBOUND_QUEUE_TOPIC,
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              conversationId: job.payload.conversationId,
              messageId: job.payload.messageId,
              channel: job.payload.channel
            },
            "Outbound message sent"
          );
        } catch (error) {
          if (error instanceof TerminalOutboundDeliveryError) {
            await this.queue.markDone(job.id);
            processed += 1;
            workerMetrics.incr("queueJobsProcessed");
            logger.warn(
              {
                topic: OUTBOUND_QUEUE_TOPIC,
                queueJobId: job.id,
                tenantId: job.payload.tenantId,
                conversationId: job.payload.conversationId,
                messageId: job.payload.messageId,
                channel: job.payload.channel,
                internalCode: error.internalCode,
                error: serializeError(error.causeError ?? error)
              },
              "Outbound job completed (non-retryable provider failure; message marked failed)"
            );
            continue;
          }
          if (error instanceof RetryableOutboundDeliveryError) {
            failed += 1;
            const failure = await this.queue.markFailed(job, error);
            workerMetrics.incr("queueJobsFailed");
            workerMetrics.incr("queueJobsRetried");
            if (failure.deadLetter) {
              deadLettered += 1;
              workerMetrics.incr("queueJobsDeadLettered");
              if (this.messageRepository) {
                await this.messageRepository.markFailed(
                  job.payload.messageId,
                  resolveRetryableDeadLetterFailurePayload(error)
                );
              }
            }
            logger.error(
              {
                topic: OUTBOUND_QUEUE_TOPIC,
                queueJobId: job.id,
                tenantId: job.payload.tenantId,
                conversationId: job.payload.conversationId,
                messageId: job.payload.messageId,
                retryCount: failure.retryCount,
                deadLetter: failure.deadLetter,
                nextAvailableAt: failure.nextAvailableAt,
                deliveryErrorCode: error.deliveryErrorCode,
                error: serializeError(error)
              },
              "Outbound message failed (retryable)"
            );
            continue;
          }
          failed += 1;
          const failure = await this.queue.markFailed(job, error);
          workerMetrics.incr("queueJobsFailed");
          workerMetrics.incr("queueJobsRetried");
          if (failure.deadLetter) deadLettered += 1;
          if (failure.deadLetter) workerMetrics.incr("queueJobsDeadLettered");
          logger.error(
            {
              topic: OUTBOUND_QUEUE_TOPIC,
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              conversationId: job.payload.conversationId,
              messageId: job.payload.messageId,
              retryCount: failure.retryCount,
              deadLetter: failure.deadLetter,
              nextAvailableAt: failure.nextAvailableAt,
              error: serializeError(error)
            },
            "Outbound message failed"
          );
        } finally {
          decrementOutboundActiveJobs();
        }
      }
    });

    const hb = setInterval(() => {
      touchLoopProgress("outbound");
    }, this.heartbeatMs);
    try {
      await Promise.all(workers);
    } finally {
      clearInterval(hb);
    }
    touchLoopProgress("outbound");

    logger.info(
      {
        topic: OUTBOUND_QUEUE_TOPIC,
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
    while (!isWorkerShuttingDown()) {
      if (!this.loopStartedLogged) {
        this.loopStartedLogged = true;
        markLoopStarted("outbound");
        emitWorkerLoopStarted("outbound", {
          topic: OUTBOUND_QUEUE_TOPIC,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          claimTimeoutMs: this.claimTimeoutMs,
          runOnceTimeoutMs: this.runOnceTimeoutMs
        });
        logger.info(
          {
            event: "worker_loop_started",
            loop: "outbound",
            topic: OUTBOUND_QUEUE_TOPIC,
            pollIntervalMs: this.pollIntervalMs,
            batchSize: this.batchSize,
            concurrency: this.concurrency,
            claimTimeoutMs: this.claimTimeoutMs,
            runOnceTimeoutMs: this.runOnceTimeoutMs
          },
          "outbound_loop_started"
        );
      }
      try {
        await withTimeout(this.runOnce(), this.runOnceTimeoutMs, "outbound_run_once");
      } catch (error) {
        recordLoopError("outbound", error);
        emitWorkerLoopError("outbound", error, {
          topic: OUTBOUND_QUEUE_TOPIC,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          pid: process.pid
        });
        logger.error(
          {
            event: "worker_loop_error",
            loop: "outbound",
            error: serializeError(error),
            worker: "outbound-worker",
            pid: process.pid
          },
          "outbound_iteration_error"
        );
      }
      if (isWorkerShuttingDown()) break;
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
