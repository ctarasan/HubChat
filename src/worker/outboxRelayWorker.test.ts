import test from "node:test";
import assert from "node:assert/strict";
import { OutboxRelayWorker } from "./outboxRelayWorker.js";
import type { OutboxClaimedEvent, OutboxFailureResult, OutboxPort, QueuePort, QueueFailureResult, QueueRetryJobRef } from "../domain/ports.js";

class FakeQueue implements QueuePort {
  public enqueueCalls: Array<{ topic: string; idempotencyKey?: string }> = [];
  private readonly outcomes: Array<"ok" | "duplicate" | "error">;
  constructor(outcomes: Array<"ok" | "duplicate" | "error">) {
    this.outcomes = outcomes;
  }

  async enqueue<T>(_topic: string, _event: T, opts?: { idempotencyKey?: string }): Promise<void> {
    this.enqueueCalls.push({ topic: _topic, idempotencyKey: opts?.idempotencyKey });
    const outcome = this.outcomes.shift() ?? "ok";
    if (outcome === "duplicate") {
      const err = new Error("duplicate key value violates unique constraint");
      (err as any).code = "23505";
      throw err;
    }
    if (outcome === "error") throw new Error("queue down");
  }
  async claimBatch<T>(): Promise<Array<any>> {
    return [];
  }
  async markDone(): Promise<void> {}
  async markFailed(_job: QueueRetryJobRef, _error: unknown): Promise<QueueFailureResult> {
    return { deadLetter: false, retryCount: 1, nextAvailableAt: new Date().toISOString() };
  }
  async consume<T>(_topic: string, _handler: (event: T) => Promise<void>): Promise<void> {}
}

class FakeOutbox implements OutboxPort {
  public dispatched: string[] = [];
  public failed: string[] = [];
  private readonly batches: Array<Array<OutboxClaimedEvent<Record<string, unknown>>>>;
  constructor(batches: Array<Array<OutboxClaimedEvent<Record<string, unknown>>>>) {
    this.batches = batches;
  }
  async add<T>(): Promise<void> {}
  async claimBatch<T>(): Promise<Array<OutboxClaimedEvent<T>>> {
    return (this.batches.shift() ?? []) as Array<OutboxClaimedEvent<T>>;
  }
  async markDispatched(eventId: string): Promise<void> {
    this.dispatched.push(eventId);
  }
  async markFailed(eventId: string, opts: { attemptCount: number }): Promise<OutboxFailureResult> {
    this.failed.push(eventId);
    return {
      deadLetter: false,
      attemptCount: opts.attemptCount,
      nextAvailableAt: new Date().toISOString()
    };
  }
}

function outboxEvent(id: string): OutboxClaimedEvent<Record<string, unknown>> {
  return {
    id,
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f",
    topic: "message.outbound.requested",
    payload: { messageId: id },
    idempotencyKey: `outbound:${id}`,
    attemptCount: 1,
    maxAttempts: 25
  };
}

test("failure after DB write but before dispatch is recoverable by relay", async () => {
  const outbox = new FakeOutbox([[outboxEvent("evt-1")], [outboxEvent("evt-1")]]);
  const queue = new FakeQueue(["error", "ok"]);
  const relay = new OutboxRelayWorker(outbox, queue, { batchSize: 5, concurrency: 1, pollIntervalMs: 100 });

  await relay.runOnce();
  await relay.runOnce();

  assert.equal(outbox.failed.includes("evt-1"), true);
  assert.equal(outbox.dispatched.includes("evt-1"), true);
});

test("outbox relay is safe when restarted after enqueue duplicate", async () => {
  const outbox = new FakeOutbox([[outboxEvent("evt-2")]]);
  const queue = new FakeQueue(["duplicate"]);
  const relay = new OutboxRelayWorker(outbox, queue, { batchSize: 5, concurrency: 1, pollIntervalMs: 100 });

  await relay.runOnce();

  assert.equal(outbox.failed.length, 0);
  assert.deepEqual(outbox.dispatched, ["evt-2"]);
});
