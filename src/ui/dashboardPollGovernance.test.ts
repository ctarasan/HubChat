import test from "node:test";
import assert from "node:assert/strict";
import {
  computePollBackoffIntervalMs,
  DashboardConversationPollScheduler,
  DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS,
  MAX_POLL_BACKOFF_MULTIPLIER,
  parseConversationsPollIntervalMs
} from "./dashboardPollGovernance.js";

test("parseConversationsPollIntervalMs defaults and disables at 0", () => {
  assert.equal(parseConversationsPollIntervalMs(undefined), DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS);
  assert.equal(parseConversationsPollIntervalMs(""), DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS);
  assert.equal(parseConversationsPollIntervalMs("0"), 0);
  assert.equal(parseConversationsPollIntervalMs("15000"), 15_000);
  assert.equal(parseConversationsPollIntervalMs("not-a-number"), DEFAULT_CONVERSATIONS_POLL_INTERVAL_MS);
});

test("computePollBackoffIntervalMs doubles until capped", () => {
  const base = 20_000;
  assert.equal(computePollBackoffIntervalMs(base, 0), base);
  assert.equal(computePollBackoffIntervalMs(base, 1), base * 2);
  assert.equal(computePollBackoffIntervalMs(base, 2), base * 4);
  assert.equal(computePollBackoffIntervalMs(base, 3), base * MAX_POLL_BACKOFF_MULTIPLIER);
  assert.equal(computePollBackoffIntervalMs(base, 10), base * MAX_POLL_BACKOFF_MULTIPLIER);
});

test("scheduler does not poll while document is hidden", async () => {
  let visible = false;
  let refreshCalls = 0;
  const timeouts: Array<{ fn: () => void; ms: number }> = [];

  const scheduler = new DashboardConversationPollScheduler({
    baseIntervalMs: 1000,
    refresh: async () => {
      refreshCalls += 1;
      return true;
    },
    isDocumentVisible: () => visible,
    setTimeoutFn: (fn, ms) => {
      timeouts.push({ fn, ms });
      return timeouts.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => {
      timeouts.length = 0;
    }
  });

  scheduler.start();
  assert.equal(refreshCalls, 0);
  assert.equal(timeouts.length, 0);

  visible = true;
  await scheduler.onDocumentVisibilityChange();
  assert.equal(refreshCalls, 1);

  visible = false;
  await scheduler.onDocumentVisibilityChange();
  assert.equal(timeouts.length, 0);

  const pending = [...timeouts];
  for (const t of pending) t.fn();
  assert.equal(refreshCalls, 1);

  scheduler.stop();
});

test("scheduler resumes refresh when document becomes visible", async () => {
  let visible = false;
  let refreshCalls = 0;

  const scheduler = new DashboardConversationPollScheduler({
    baseIntervalMs: 5000,
    refresh: async () => {
      refreshCalls += 1;
      return true;
    },
    isDocumentVisible: () => visible,
    setTimeoutFn: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearTimeoutFn: () => {}
  });

  scheduler.start();
  visible = true;
  await scheduler.onDocumentVisibilityChange();
  assert.equal(refreshCalls, 1);
  scheduler.stop();
});

test("scheduler prevents overlapping silent refreshes", async () => {
  let visible = true;
  let refreshCalls = 0;
  let refreshInProgress = false;

  const scheduler = new DashboardConversationPollScheduler({
    baseIntervalMs: 1000,
    refresh: async () => {
      refreshCalls += 1;
      refreshInProgress = true;
      await new Promise((r) => setTimeout(r, 10));
      refreshInProgress = false;
      return true;
    },
    isDocumentVisible: () => visible,
    setTimeoutFn: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearTimeoutFn: () => {}
  });

  visible = true;
  await Promise.all([
    scheduler.onDocumentVisibilityChange(),
    scheduler.onDocumentVisibilityChange()
  ]);
  assert.equal(refreshCalls, 1);
  assert.equal(refreshInProgress, false);
  scheduler.stop();
});

test("scheduler backs off after failed refresh and resets after success", async () => {
  let visible = true;
  let refreshCalls = 0;
  let shouldFail = true;
  const scheduled: Array<{ fn: () => void; ms: number }> = [];

  const scheduler = new DashboardConversationPollScheduler({
    baseIntervalMs: 1000,
    refresh: async () => {
      refreshCalls += 1;
      return !shouldFail;
    },
    isDocumentVisible: () => visible,
    setTimeoutFn: (fn, ms) => {
      scheduled.push({ fn, ms });
      return scheduled.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => {}
  });

  visible = true;
  await scheduler.onDocumentVisibilityChange();
  assert.equal(refreshCalls, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.ms, 2000);

  shouldFail = false;
  await scheduled[0]?.fn();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(refreshCalls, 2);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1]?.ms, 1000);

  scheduler.stop();
});

test("scheduler with base interval 0 does not schedule", async () => {
  let refreshCalls = 0;
  const scheduler = new DashboardConversationPollScheduler({
    baseIntervalMs: 0,
    refresh: async () => {
      refreshCalls += 1;
      return true;
    }
  });
  scheduler.start();
  await scheduler.onDocumentVisibilityChange();
  assert.equal(refreshCalls, 0);
  scheduler.stop();
});
