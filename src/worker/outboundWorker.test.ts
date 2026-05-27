import test from "node:test";
import assert from "node:assert/strict";
import { OutboundWorker, OUTBOUND_QUEUE_TOPIC } from "./outboundWorker.js";
import type { OutboundMessageRequestedPayload } from "../domain/events.js";
import type {
  MessageDeliveryFailurePayload,
  MessageDeliverySnapshot,
  MessageRepository,
  QueueClaimedJob,
  QueueFailureResult,
  QueuePort,
  QueueRetryJobRef
} from "../domain/ports.js";
import {
  RetryableOutboundDeliveryError,
  TerminalOutboundDeliveryError,
  INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR,
  TH_MSG_FACEBOOK_API_TEMPORARY_FINAL
} from "../lib/outboundDeliveryError.js";
import { forceWorkerShutdownForTests } from "./workerShutdownCoordinator.js";

function terminalMessageRepository(
  deliveryStatus: MessageDeliverySnapshot["deliveryStatus"] = "SENT"
): Pick<MessageRepository, "getDeliverySnapshot" | "markFailed"> {
  return {
    getDeliverySnapshot: async () => ({
      externalMessageId: deliveryStatus === "SENT" ? "ext-1" : null,
      deliveryStatus
    }),
    markFailed: async () => {}
  };
}

class FakeQueue implements QueuePort {
  public doneIds: string[] = [];
  public failedIds: string[] = [];

  constructor(private readonly jobs: Array<QueueClaimedJob<OutboundMessageRequestedPayload>>) {}

  async enqueue<T>(_topic: string, _event: T): Promise<void> {}

  async claimBatch<T>(topic: string, _opts?: { limit?: number }): Promise<Array<QueueClaimedJob<T>>> {
    assert.equal(topic, OUTBOUND_QUEUE_TOPIC);
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
    { batchSize: 10, concurrency: 2, pollIntervalMs: 100, messageRepository: terminalMessageRepository() }
  );

  await worker.runOnce();

  assert.equal(queue.doneIds.length, jobs.length);
  assert.equal(queue.failedIds.length, 0);
  assert.equal(maxActive <= 2, true);
});

test("OutboundWorker marks queue job done when use case throws TerminalOutboundDeliveryError", async () => {
  const jobs = [
    {
      id: "job-term-1",
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      payload: {
        tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
        leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
        conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
        messageId: "30f75b4e-cf3d-49fe-a57a-4f2e44fdca99",
        channel: "INSTAGRAM" as const,
        channelThreadId: "ig:user:1",
        content: "x"
      },
      retryCount: 0,
      maxRetries: 10
    }
  ];
  const queue = new FakeQueue(jobs);
  const worker = new OutboundWorker(
    queue,
    {
      execute: async () => {
        throw new TerminalOutboundDeliveryError("ส่งไม่ผ่าน", "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW", new Error("inner"));
      }
    } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: terminalMessageRepository("FAILED")
    }
  );
  await worker.runOnce();
  assert.deepEqual(queue.doneIds, ["job-term-1"]);
  assert.equal(queue.failedIds.length, 0);
});

test("OutboundWorker does not markDone when execute succeeds but delivery snapshot is PENDING", async () => {
  const jobs = [
    {
      id: "job-pending-1",
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      payload: {
        tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
        leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
        conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
        messageId: "pending-msg-1",
        channel: "INSTAGRAM" as const,
        channelThreadId: "ig:user:1",
        content: "x"
      },
      retryCount: 0,
      maxRetries: 10
    }
  ];
  const queue = new FakeQueue(jobs);
  const worker = new OutboundWorker(
    queue,
    { execute: async () => {} } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: terminalMessageRepository("PENDING")
    }
  );
  await worker.runOnce();
  assert.equal(queue.doneIds.length, 0);
  assert.deepEqual(queue.failedIds, ["job-pending-1"]);
});

test("OutboundWorker marksDone when execute succeeds and delivery snapshot is SENT", async () => {
  const jobs = [
    {
      id: "job-sent-1",
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      payload: {
        tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
        leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
        conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
        messageId: "sent-msg-1",
        channel: "LINE" as const,
        channelThreadId: "Ue56f7d11e481c3e0f8d0924f68b2c673",
        content: "x"
      },
      retryCount: 0,
      maxRetries: 10
    }
  ];
  const queue = new FakeQueue(jobs);
  const worker = new OutboundWorker(
    queue,
    { execute: async () => {} } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: terminalMessageRepository("SENT")
    }
  );
  await worker.runOnce();
  assert.deepEqual(queue.doneIds, ["job-sent-1"]);
  assert.equal(queue.failedIds.length, 0);
});

test("OutboundWorker does not markDone when TerminalOutboundDeliveryError but snapshot is PENDING", async () => {
  const jobs = [
    {
      id: "job-term-pending-1",
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      payload: {
        tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
        leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
        conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
        messageId: "term-pending-msg-1",
        channel: "INSTAGRAM" as const,
        channelThreadId: "ig:user:1",
        content: "x"
      },
      retryCount: 0,
      maxRetries: 10
    }
  ];
  const queue = new FakeQueue(jobs);
  const worker = new OutboundWorker(
    queue,
    {
      execute: async () => {
        throw new TerminalOutboundDeliveryError("terminal", "INSTAGRAM_OUTSIDE_ALLOWED_WINDOW");
      }
    } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: terminalMessageRepository("PENDING")
    }
  );
  await worker.runOnce();
  assert.equal(queue.doneIds.length, 0);
  assert.deepEqual(queue.failedIds, ["job-term-pending-1"]);
});

test("OutboundWorker runOnce can be invoked again after a claim failure", async () => {
  let claimCalls = 0;
  const queue: QueuePort = {
    async claimBatch<T>(_topic: string): Promise<Array<QueueClaimedJob<T>>> {
      claimCalls += 1;
      if (claimCalls === 1) throw new Error("claim rpc failed");
      return [];
    },
    async enqueue(): Promise<void> {},
    async markDone(): Promise<void> {},
    async markFailed(): Promise<QueueFailureResult> {
      return { deadLetter: false, retryCount: 1, nextAvailableAt: new Date().toISOString() };
    },
    async consume(): Promise<void> {}
  };
  const worker = new OutboundWorker(
    queue,
    { execute: async () => {} } as any,
    { batchSize: 5, concurrency: 1, pollIntervalMs: 100, claimTimeoutMs: 2000 }
  );
  await assert.rejects(() => worker.runOnce(), /claim rpc failed/);
  await worker.runOnce();
  assert.ok(claimCalls >= 2);
});

test("OutboundWorker still claims subsequent jobs after a retryable provider error", async () => {
  const mk = (id: string, messageId: string): QueueClaimedJob<OutboundMessageRequestedPayload> => ({
    id,
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    payload: {
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
      conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
      messageId,
      channel: "LINE" as const,
      channelThreadId: "Ue56f7d11e481c3e0f8d0924f68b2c673",
      content: "test"
    },
    retryCount: 0,
    maxRetries: 10
  });
  const jobs = [mk("job-a", "m1"), mk("job-b", "m2")];
  const queue = new FakeQueue(jobs);
  let n = 0;
  const worker = new OutboundWorker(
    queue,
    {
      execute: async () => {
        n += 1;
        if (n === 1) throw new Error("transient provider");
      }
    } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: terminalMessageRepository("SENT")
    }
  );
  await worker.runOnce();
  assert.equal(n, 2);
  assert.equal(queue.failedIds.length, 1);
  assert.equal(queue.doneIds.length, 1);
});

test("OutboundWorker persists final message failure when RetryableOutboundDeliveryError dead-letters", async () => {
  const jobs: Array<QueueClaimedJob<OutboundMessageRequestedPayload>> = [
    {
      id: "job-dl-1",
      tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
      payload: {
        tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
        leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
        conversationId: "d17bc402-7461-48fb-8b75-f2f3b02eb1b1",
        messageId: "dead-letter-msg-1",
        channel: "FACEBOOK",
        channelThreadId: "user:1",
        content: "x"
      },
      retryCount: 1,
      maxRetries: 2
    }
  ];
  let lastMessageFailure: MessageDeliveryFailurePayload | null = null;
  const queue: QueuePort = {
    async claimBatch<T>(_topic: string): Promise<Array<QueueClaimedJob<T>>> {
      return jobs as Array<QueueClaimedJob<T>>;
    },
    async enqueue(): Promise<void> {},
    async markDone(): Promise<void> {},
    async markFailed(job: QueueRetryJobRef): Promise<QueueFailureResult> {
      const retryCount = job.retryCount + 1;
      return {
        deadLetter: retryCount >= job.maxRetries,
        retryCount,
        nextAvailableAt: new Date().toISOString()
      };
    },
    async consume(): Promise<void> {}
  };
  const worker = new OutboundWorker(
    queue,
    {
      execute: async () => {
        throw new RetryableOutboundDeliveryError(
          INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR,
          "retrying copy",
          "technical fb temp"
        );
      }
    } as any,
    {
      batchSize: 10,
      concurrency: 1,
      pollIntervalMs: 100,
      messageRepository: {
        markFailed: async (_id: string, f: string | MessageDeliveryFailurePayload) => {
          lastMessageFailure = typeof f === "string" ? null : f;
        }
      } as any
    }
  );
  await worker.runOnce();
  const failure = lastMessageFailure as MessageDeliveryFailurePayload | null;
  assert.ok(failure, "expected messageRepository.markFailed on dead-letter");
  assert.equal(failure.deliveryErrorCode, INTERNAL_CODE_FACEBOOK_API_TEMPORARY_ERROR);
  assert.equal(failure.userFacingMessage, TH_MSG_FACEBOOK_API_TEMPORARY_FINAL);
});

test("OutboundWorker runForever stops before next claim after shutdown flag", async () => {
  let claims = 0;
  const queue: QueuePort = {
    async claimBatch<T>(_topic: string): Promise<Array<QueueClaimedJob<T>>> {
      claims += 1;
      if (claims > 1) {
        assert.fail("should not claim again after shutdown");
      }
      return [] as Array<QueueClaimedJob<T>>;
    },
    async enqueue(): Promise<void> {},
    async markDone(): Promise<void> {},
    async markFailed(): Promise<QueueFailureResult> {
      return { deadLetter: false, retryCount: 0, nextAvailableAt: new Date().toISOString() };
    },
    async consume(): Promise<void> {}
  };
  const worker = new OutboundWorker(
    queue,
    { execute: async () => {} } as any,
    { batchSize: 5, concurrency: 1, pollIntervalMs: 30 }
  );
  const run = worker.runForever();
  await new Promise((r) => setTimeout(r, 15));
  forceWorkerShutdownForTests(true);
  await Promise.race([
    run,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("runForever did not exit")), 3000))
  ]);
  assert.equal(claims, 1);
  forceWorkerShutdownForTests(false);
});
