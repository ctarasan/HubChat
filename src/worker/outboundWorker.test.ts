import test from "node:test";
import assert from "node:assert/strict";
import { OutboundWorker } from "./outboundWorker.js";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type { QueueClaimedJob, QueueFailureResult, QueuePort, QueueRetryJobRef } from "../domain/ports.js";

class FakeQueue implements QueuePort {
  public doneIds: string[] = [];
  public failedIds: string[] = [];

  constructor(private readonly jobs: Array<QueueClaimedJob<OutboundMessageRequestedPayload>>) {}

  async enqueue<T>(_topic: string, _event: T): Promise<void> {}

  async claimBatch<T>(_topic: string): Promise<Array<QueueClaimedJob<T>>> {
    return this.jobs as Array<QueueClaimedJob<T>>;
  }

  async markDone(jobId: string): Promise<void> {
    this.doneIds.push(jobId);
  }

  async markFailed(job: QueueRetryJobRef, _error: unknown): Promise<QueueFailureResult> {
    this.failedIds.push(job.id);
    return {
      deadLetter: false,
      retryCount: job.retryCount + 1,
      nextAvailableAt: new Date().toISOString()
    };
  }

  async consume<T>(_topic: string, _handler: (event: T) => Promise<void>): Promise<void> {}
}

test("OutboundWorker processes jobs with bounded concurrency", async () => {
  const jobs = Array.from({ length: 6 }, (_, i) => ({
    id: `job-${i + 1}`,
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    payload: {
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
      conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
      messageId: `30f75b4e-cf3d-49fe-a57a-4f2e44fdca0${i}`,
      channel: "LINE" as const,
      channelThreadId: "Ue56f7d11e481c3e0f8d0924f68b2c673",
      content: "test"
    },
    retryCount: 0,
    maxRetries: 10
  }));
  const queue = new FakeQueue(jobs);
  let active = 0;
  let maxActive = 0;

  const worker = new OutboundWorker(
    queue,
    {
      execute: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      }
    } as any,
    { batchSize: 10, concurrency: 2, pollIntervalMs: 100 }
  );

  await worker.runOnce();

  assert.equal(queue.doneIds.length, jobs.length);
  assert.equal(queue.failedIds.length, 0);
  assert.equal(maxActive <= 2, true);
});
