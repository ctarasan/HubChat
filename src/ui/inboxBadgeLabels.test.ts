import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFollowUpHeaderLine,
  parseIsoToDate,
  resolveInboxBadgeDescriptors
} from "./inboxBadgeLabels.js";

const CLOCK = new Date("2026-05-15T12:00:00.000Z");

test("parseIsoToDate accepts valid ISO and rejects invalid", () => {
  assert.ok(parseIsoToDate("2026-05-15T12:00:00.000Z"));
  assert.equal(parseIsoToDate("not-a-date"), null);
  assert.equal(parseIsoToDate(""), null);
  assert.equal(parseIsoToDate(null), null);
});

test("follow-up overdue label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "2026-05-15T10:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "Follow-up overdue"), true);
});

test("follow-up today label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "2026-05-15T18:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "Follow-up today"), true);
});

test("follow-up upcoming label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "2026-05-16T09:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "Follow-up upcoming"), true);
});

test("SLA overdue label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    sla_due_at: "2026-05-15T10:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "SLA overdue"), true);
});

test("SLA due soon label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    sla_due_at: "2026-05-15T13:30:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "SLA due soon"), true);
});

test("waiting on us label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    last_customer_message_at: "2026-05-15T11:00:00.000Z",
    last_agent_message_at: "2026-05-14T10:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "Waiting on us"), true);
});

test("waiting on customer label", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    last_customer_message_at: "2026-05-14T10:00:00.000Z",
    last_agent_message_at: "2026-05-15T11:00:00.000Z"
  });
  assert.equal(badges.some((b) => b.label === "Waiting on customer"), true);
});

test("invalid timestamps are ignored for badges", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "not-a-date",
    sla_due_at: "invalid",
    last_customer_message_at: "x",
    last_agent_message_at: "y"
  });
  assert.equal(badges.length, 0);
});

test("at most two badges returned", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    sla_due_at: "2026-05-15T10:00:00.000Z",
    follow_up_at: "2026-05-15T11:00:00.000Z",
    last_customer_message_at: "2026-05-15T11:30:00.000Z",
    last_agent_message_at: null
  });
  assert.equal(badges.length, 2);
});

test("priority: SLA overdue then follow-up overdue", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    sla_due_at: "2026-05-15T10:00:00.000Z",
    follow_up_at: "2026-05-15T11:00:00.000Z"
  });
  assert.deepEqual(
    badges.map((b) => b.label),
    ["SLA overdue", "Follow-up overdue"]
  );
});

test("priority: follow-up today before SLA due soon", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "2026-05-15T18:00:00.000Z",
    sla_due_at: "2026-05-15T13:30:00.000Z"
  });
  assert.deepEqual(
    badges.map((b) => b.label),
    ["Follow-up today", "SLA due soon"]
  );
});

test("priority drops waiting when SLA and follow-up fill two slots", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    sla_due_at: "2026-05-15T10:00:00.000Z",
    follow_up_at: "2026-05-15T11:00:00.000Z",
    last_customer_message_at: "2026-05-15T11:30:00.000Z",
    last_agent_message_at: "2026-05-14T09:00:00.000Z"
  });
  assert.deepEqual(
    badges.map((b) => b.label),
    ["SLA overdue", "Follow-up overdue"]
  );
  assert.equal(badges.some((b) => b.label === "Waiting on us"), false);
});

test("follow-up badge includes trimmed note as title", () => {
  const badges = resolveInboxBadgeDescriptors(CLOCK, {
    follow_up_at: "2026-05-15T10:00:00.000Z",
    follow_up_note: "  Call Sam "
  });
  const fu = badges.find((b) => b.label === "Follow-up overdue");
  assert.equal(fu?.title, "Call Sam");
});

test("formatFollowUpHeaderLine combines datetime and note", () => {
  const line = formatFollowUpHeaderLine({
    follow_up_at: "2026-05-15T10:00:00.000Z",
    follow_up_note: "Ping"
  });
  assert.equal(line?.includes("Follow-up:"), true);
  assert.equal(line?.includes("Ping"), true);
});

test("formatFollowUpHeaderLine note only", () => {
  const line = formatFollowUpHeaderLine({ follow_up_note: "Reminder" });
  assert.equal(line, "Follow-up note: Reminder");
});
