import pino from "pino";
import type { InboundMessageNormalizedPayload } from "../domain/events.js";
import type { QueuePort } from "../domain/ports.js";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";
import { workerMetrics } from "./workerMetrics.js";
import { serializeError } from "../lib/serializeError.js";
import { withTimeout } from "../lib/asyncTimeout.js";
import {
  recordLoopClaimResult,
  recordLoopError,
  recordLoopPoll,
  touchLoopProgress
} from "./workerLoopLiveness.js";

const logger = pino({ name: "inbound-worker" });

const INBOUND_TOPIC = "message.inbound.normalized" as const;

interface InboundWorkerConfig {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
  claimTimeoutMs?: number;
  pollLogIntervalMs?: number;
  heartbeatMs?: number;
}

export class InboundWorker {
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly claimTimeoutMs: number;
  private readonly pollLogIntervalMs: number;
  private readonly heartbeatMs: number;
  private lastPollStructuredLogAt = 0;
  private lastClaimResultLogAt = 0;
  private loopStartedLogged = false;

  constructor(
    private readonly queue: QueuePort,
    private readonly useCase: ProcessInboundMessageUseCase,
    config?: InboundWorkerConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 20);
    this.concurrency = Math.max(1, config?.concurrency ?? 8);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
    this.claimTimeoutMs = Math.max(1000, config?.claimTimeoutMs ?? 45_000);
    this.pollLogIntervalMs = Math.max(1000, config?.pollLogIntervalMs ?? 30_000);
    this.heartbeatMs = Math.max(1000, config?.heartbeatMs ?? 15_000);
  }

  private maybeLogWorkerLoopPoll(): void {
    const now = Date.now();
    if (now - this.lastPollStructuredLogAt < this.pollLogIntervalMs) return;
    this.lastPollStructuredLogAt = now;
    logger.info(
      {
        event: "worker_loop_poll",
        loop: "inbound",
        topic: INBOUND_TOPIC,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        lastPollAt: new Date(now).toISOString()
      },
      "Inbound worker poll"
    );
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    recordLoopPoll("inbound");
    this.maybeLogWorkerLoopPoll();

    const jobs = await withTimeout(
      this.queue.claimBatch<InboundMessageNormalizedPayload>(INBOUND_TOPIC, {
        limit: this.batchSize
      }),
      this.claimTimeoutMs,
      "inbound_claim_batch"
    );
    recordLoopClaimResult("inbound", jobs.length);
    const nowAfterClaim = Date.now();
    if (jobs.length > 0 || nowAfterClaim - this.lastClaimResultLogAt >= this.pollLogIntervalMs) {
      this.lastClaimResultLogAt = nowAfterClaim;
      logger.info({ event: "worker_loop_claim_result", loop: "inbound", claimedCount: jobs.length }, "Inbound claim result");
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
        try {
          await this.useCase.execute(job.payload);
          await this.queue.markDone(job.id);
          processed += 1;
          workerMetrics.incr("queueJobsProcessed");
          logger.info(
            {
              topic: INBOUND_TOPIC,
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              channel: job.payload.channel,
              channelThreadId: job.payload.channelThreadId,
              externalUserId: job.payload.externalUserId,
              externalMessageId: job.payload.externalMessageId,
              displayNamePresent: Boolean(job.payload.senderDisplayName ?? job.payload.profile?.name),
              profileImagePresent: Boolean(
                job.payload.senderProfileImageUrl ?? job.payload.profile?.profileImageUrl ?? job.payload.profile?.avatarUrl
              )
            },
            "Inbound message processed"
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
              topic: INBOUND_TOPIC,
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              channelThreadId: job.payload.channelThreadId,
              retryCount: failure.retryCount,
              deadLetter: failure.deadLetter,
              nextAvailableAt: failure.nextAvailableAt,
              error: serializeError(error)
            },
            "Inbound message processing failed"
          );
        }
      }
    });

    const hb = setInterval(() => {
      touchLoopProgress("inbound");
    }, this.heartbeatMs);
    try {
      await Promise.all(workers);
    } finally {
      clearInterval(hb);
    }
    touchLoopProgress("inbound");

    logger.info(
      {
        topic: INBOUND_TOPIC,
        processed,
        failed,
        deadLettered,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        durationMs: Date.now() - startedAt
      },
      "Inbound batch completed"
    );
  }

  async runForever(): Promise<void> {
    while (true) {
      if (!this.loopStartedLogged) {
        this.loopStartedLogged = true;
        logger.info(
          {
            event: "worker_loop_started",
            loop: "inbound",
            topic: INBOUND_TOPIC,
            pollIntervalMs: this.pollIntervalMs,
            batchSize: this.batchSize,
            concurrency: this.concurrency,
            claimTimeoutMs: this.claimTimeoutMs
          },
          "Inbound worker loop started"
        );
      }
      try {
        await this.runOnce();
      } catch (error) {
        recordLoopError("inbound", error);
        logger.error(
          {
            event: "worker_loop_error",
            loop: "inbound",
            error: serializeError(error),
            worker: "inbound-worker",
            pid: process.pid
          },
          "Inbound worker loop failed"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
