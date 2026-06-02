import pino from "pino";
import type { QueuePort } from "../domain/ports.js";
import type { ProcessProfileAvatarCacheUseCase } from "../application/profileAvatar/processProfileAvatarCache.js";
import type { ProfileAvatarCachePayload } from "../application/profileAvatar/profileAvatarCachePayload.js";
import { PROFILE_AVATAR_CACHE_TOPIC } from "../lib/profileAvatarCacheCommon.js";
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

const logger = pino({ name: "profile-avatar-cache-worker" });

interface ProfileAvatarCacheWorkerConfig {
  batchSize?: number;
  concurrency?: number;
  pollIntervalMs?: number;
  claimTimeoutMs?: number;
  pollLogIntervalMs?: number;
  heartbeatMs?: number;
}

export class ProfileAvatarCacheWorker {
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
    private readonly useCase: ProcessProfileAvatarCacheUseCase,
    config?: ProfileAvatarCacheWorkerConfig
  ) {
    this.batchSize = Math.max(1, config?.batchSize ?? 10);
    this.concurrency = Math.max(1, config?.concurrency ?? 4);
    this.pollIntervalMs = Math.max(50, config?.pollIntervalMs ?? 200);
    this.claimTimeoutMs = Math.max(1000, config?.claimTimeoutMs ?? 45_000);
    this.pollLogIntervalMs = Math.max(1000, config?.pollLogIntervalMs ?? 30_000);
    this.heartbeatMs = Math.max(1000, config?.heartbeatMs ?? 15_000);
  }

  private maybeLogWorkerLoopPoll(): void {
    const now = Date.now();
    if (now - this.lastPollStructuredLogAt < this.pollLogIntervalMs) return;
    this.lastPollStructuredLogAt = now;
    emitWorkerLoopPoll("profileAvatarCache", {
      topic: PROFILE_AVATAR_CACHE_TOPIC,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      concurrency: this.concurrency,
      lastPollAt: new Date(now).toISOString()
    });
    logger.info(
      {
        event: "worker_loop_poll",
        loop: "profileAvatarCache",
        topic: PROFILE_AVATAR_CACHE_TOPIC,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        lastPollAt: new Date(now).toISOString()
      },
      "profile_avatar_cache_poll"
    );
  }

  async runOnce(): Promise<void> {
    const startedAt = Date.now();
    recordLoopPoll("profileAvatarCache");
    this.maybeLogWorkerLoopPoll();

    const jobs = await withTimeout(
      this.queue.claimBatch<ProfileAvatarCachePayload>(PROFILE_AVATAR_CACHE_TOPIC, {
        limit: this.batchSize
      }),
      this.claimTimeoutMs,
      "profile_avatar_cache_claim_batch"
    );
    recordLoopClaimResult("profileAvatarCache", jobs.length);
    const nowAfterClaim = Date.now();
    if (jobs.length > 0 || nowAfterClaim - this.lastClaimResultLogAt >= this.pollLogIntervalMs) {
      this.lastClaimResultLogAt = nowAfterClaim;
      emitWorkerLoopClaimResult("profileAvatarCache", jobs.length);
      logger.info(
        { event: "worker_loop_claim_result", loop: "profileAvatarCache", claimedCount: jobs.length },
        "profile_avatar_cache_claim"
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
        try {
          const result = await this.useCase.execute(job.payload);
          if (result.retryable) {
            const failure = await this.queue.markFailed(job, new Error("profile_avatar_cache_retryable"));
            failed += 1;
            workerMetrics.incr("queueJobsFailed");
            workerMetrics.incr("queueJobsRetried");
            if (failure.deadLetter) deadLettered += 1;
            if (failure.deadLetter) workerMetrics.incr("queueJobsDeadLettered");
          } else {
            await this.queue.markDone(job.id);
            processed += 1;
            workerMetrics.incr("queueJobsProcessed");
          }
        } catch (error) {
          failed += 1;
          const failure = await this.queue.markFailed(job, error);
          workerMetrics.incr("queueJobsFailed");
          workerMetrics.incr("queueJobsRetried");
          if (failure.deadLetter) deadLettered += 1;
          if (failure.deadLetter) workerMetrics.incr("queueJobsDeadLettered");
          logger.error(
            {
              topic: PROFILE_AVATAR_CACHE_TOPIC,
              queueJobId: job.id,
              tenantId: job.payload.tenantId,
              contactIdentityId: job.payload.contactIdentityId,
              retryCount: failure.retryCount,
              deadLetter: failure.deadLetter,
              error: serializeError(error)
            },
            "profile avatar cache job failed"
          );
        }
      }
    });

    const hb = setInterval(() => {
      touchLoopProgress("profileAvatarCache");
    }, this.heartbeatMs);
    try {
      await Promise.all(workers);
    } finally {
      clearInterval(hb);
    }
    touchLoopProgress("profileAvatarCache");

    logger.info(
      {
        topic: PROFILE_AVATAR_CACHE_TOPIC,
        processed,
        failed,
        deadLettered,
        batchSize: this.batchSize,
        concurrency: this.concurrency,
        durationMs: Date.now() - startedAt
      },
      "profile avatar cache batch completed"
    );
  }

  async runForever(): Promise<void> {
    while (!isWorkerShuttingDown()) {
      if (!this.loopStartedLogged) {
        this.loopStartedLogged = true;
        markLoopStarted("profileAvatarCache");
        emitWorkerLoopStarted("profileAvatarCache", {
          topic: PROFILE_AVATAR_CACHE_TOPIC,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          claimTimeoutMs: this.claimTimeoutMs
        });
        logger.info(
          {
            event: "worker_loop_started",
            loop: "profileAvatarCache",
            topic: PROFILE_AVATAR_CACHE_TOPIC,
            pollIntervalMs: this.pollIntervalMs,
            batchSize: this.batchSize,
            concurrency: this.concurrency,
            claimTimeoutMs: this.claimTimeoutMs
          },
          "profile_avatar_cache_loop_started"
        );
      }
      try {
        await this.runOnce();
      } catch (error) {
        recordLoopError("profileAvatarCache", error);
        emitWorkerLoopError("profileAvatarCache", error, {
          topic: PROFILE_AVATAR_CACHE_TOPIC,
          pollIntervalMs: this.pollIntervalMs,
          batchSize: this.batchSize,
          concurrency: this.concurrency,
          pid: process.pid
        });
        logger.error(
          {
            event: "worker_loop_error",
            loop: "profileAvatarCache",
            error: serializeError(error),
            pid: process.pid
          },
          "profile_avatar_cache_iteration_error"
        );
      }
      if (isWorkerShuttingDown()) break;
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }
}
