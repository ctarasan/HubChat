import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFollowUpBucket,
  computeSlaBucket,
  computeWaitingState
} from "./conversationInboxBuckets.js";
import {
  buildDefaultTenantSlaPolicy,
  defaultSlaDueSoonMs,
  slaDueSoonMsFromWarningMinutes
} from "./tenantSlaPolicy.js";

const FROZEN = new Date("2026-05-15T12:00:00.000Z");
const DEFAULT_DUE_SOON_MS = defaultSlaDueSoonMs();

test("computeSlaBucket none when slaDueAt null", () => {
  assert.equal(computeSlaBucket(FROZEN, null), "none");
});

test("computeSlaBucket overdue when past deadline", () => {
  assert.equal(computeSlaBucket(FROZEN, new Date("2026-05-15T11:00:00.000Z")), "overdue");
});

test("computeSlaBucket dueSoon within default factory warning window", () => {
  const dueAt = new Date(FROZEN.getTime() + DEFAULT_DUE_SOON_MS - 60 * 1000);
  assert.equal(computeSlaBucket(FROZEN, dueAt), "dueSoon");
});

test("computeSlaBucket ok beyond dueSoon window", () => {
  const dueAt = new Date(FROZEN.getTime() + DEFAULT_DUE_SOON_MS + 60 * 1000);
  assert.equal(computeSlaBucket(FROZEN, dueAt), "ok");
});

test("computeSlaBucket respects custom dueSoonMs", () => {
  const soon = new Date(FROZEN.getTime() + 30 * 60 * 1000);
  assert.equal(computeSlaBucket(FROZEN, soon, { dueSoonMs: 60 * 60 * 1000 }), "dueSoon");
  assert.equal(computeSlaBucket(FROZEN, soon, { dueSoonMs: 15 * 60 * 1000 }), "ok");
});

test("computeFollowUpBucket none when followUpAt null", () => {
  assert.equal(computeFollowUpBucket(FROZEN, null), "none");
});

test("computeFollowUpBucket overdue after instant", () => {
  assert.equal(computeFollowUpBucket(FROZEN, new Date("2026-05-15T11:00:00.000Z")), "overdue");
});

test("computeFollowUpBucket today same UTC day not overdue", () => {
  assert.equal(computeFollowUpBucket(FROZEN, new Date("2026-05-15T18:00:00.000Z")), "today");
});

test("computeFollowUpBucket upcoming future day", () => {
  assert.equal(computeFollowUpBucket(FROZEN, new Date("2026-05-16T09:00:00.000Z")), "upcoming");
});

test("defaultSlaDueSoonMs derives from buildDefaultTenantSlaPolicy only", () => {
  const policy = buildDefaultTenantSlaPolicy();
  assert.equal(defaultSlaDueSoonMs(), slaDueSoonMsFromWarningMinutes(policy.warningBeforeBreachMinutes));
});

test("computeWaitingState noRecentMessage when both null", () => {
  assert.equal(computeWaitingState(null, null), "noRecentMessage");
});

test("computeWaitingState waitingOnUs when only customer timestamp", () => {
  assert.equal(computeWaitingState(new Date("2026-05-15T10:00:00.000Z"), null), "waitingOnUs");
});

test("computeWaitingState waitingOnCustomer when only agent timestamp", () => {
  assert.equal(computeWaitingState(null, new Date("2026-05-15T10:00:00.000Z")), "waitingOnCustomer");
});

test("computeWaitingState compares timestamps", () => {
  assert.equal(
    computeWaitingState(new Date("2026-05-15T11:00:00.000Z"), new Date("2026-05-15T10:00:00.000Z")),
    "waitingOnUs"
  );
  assert.equal(
    computeWaitingState(new Date("2026-05-15T10:00:00.000Z"), new Date("2026-05-15T11:00:00.000Z")),
    "waitingOnCustomer"
  );
});

test("computeWaitingState unknown when equal", () => {
  const t = new Date("2026-05-15T10:00:00.000Z");
  assert.equal(computeWaitingState(t, t), "unknown");
});
