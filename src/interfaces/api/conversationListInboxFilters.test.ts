import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInboxFilterQuerySteps,
  buildInboxFilterQuerySteps,
  buildConversationListInboxFilters,
  parseConversationsListQuery,
  parseConversationListInboxFilters,
  utcInboxFilterClock
} from "./conversationListInboxFilters.js";

test("parseConversationListInboxFilters returns undefined when empty", () => {
  assert.equal(parseConversationListInboxFilters({}), undefined);
});

test("parseConversationListInboxFilters omits all sentinel values", () => {
  assert.deepEqual(
    parseConversationListInboxFilters({
      leadManagementStatus: "NEW",
      followUp: "all",
      sla: "all",
      waiting: "all"
    }),
    { leadManagementStatus: "NEW" }
  );
});

test("parseConversationsListQuery maps frozen contract params", () => {
  const parsed = parseConversationsListQuery({
    scope: "team",
    channel: "INSTAGRAM",
    conversationStatus: "OPEN",
    leadManagementStatus: "FOLLOW_UP",
    followUp: "scheduled",
    sla: "due_soon",
    waiting: "needs_response",
    assignedAgentId: "11111111-1111-4111-8111-111111111111",
    limit: "25"
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.scope, "team");
  assert.equal(parsed.value.channel, "INSTAGRAM");
  assert.equal(parsed.value.conversationStatus, "OPEN");
  assert.equal(parsed.value.assignedAgentId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(parsed.value.inboxFilters, {
    leadManagementStatus: "FOLLOW_UP",
    followUp: "scheduled",
    sla: "due_soon",
    waiting: "needs_response"
  });
});

test("parseConversationsListQuery accepts legacy aliases", () => {
  const parsed = parseConversationsListQuery({
    scope: "assigned_to_me",
    status: "RESOLVED",
    leadStatus: "CONTACTED",
    followUp: "has",
    sla: "has",
    assignedSalesId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.scope, "mine");
  assert.equal(parsed.value.conversationStatus, "RESOLVED");
  assert.equal(parsed.value.assignedAgentId, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(parsed.value.inboxFilters, {
    leadManagementStatus: "IN_PROGRESS",
    followUp: "scheduled",
    sla: "active"
  });
});

test("parseConversationsListQuery rejects conflicting legacy and frozen params", () => {
  const parsed = parseConversationsListQuery({
    leadManagementStatus: "NEW",
    leadStatus: "WON"
  });
  assert.equal(parsed.ok, false);
});

test("buildInboxFilterQuerySteps follow-up today uses UTC day bounds", () => {
  const clock = utcInboxFilterClock(new Date("2026-05-15T12:00:00.000Z"));
  const steps = buildInboxFilterQuerySteps({ followUp: "today" }, clock);
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0], {
    kind: "follow_up_today",
    fromIso: "2026-05-15T00:00:00.000Z",
    toIso: "2026-05-16T00:00:00.000Z",
    minIso: clock.nowIso
  });
});

test("buildInboxFilterQuerySteps lead management IN_PROGRESS and FOLLOW_UP", () => {
  const inProgress = buildInboxFilterQuerySteps({ leadManagementStatus: "IN_PROGRESS" });
  assert.deepEqual(inProgress[0], { kind: "lead_management_status", value: "IN_PROGRESS" });

  const followUp = buildInboxFilterQuerySteps({ leadManagementStatus: "FOLLOW_UP" });
  assert.deepEqual(followUp[0], { kind: "lead_management_status", value: "FOLLOW_UP" });
});

test("applyInboxFilterQuerySteps records supabase filter calls", () => {
  const calls: string[] = [];
  const q = {
    not(col: string, op: string, val: unknown) {
      calls.push(`not:${col}:${op}:${String(val)}`);
      return this;
    },
    is(col: string, val: null) {
      calls.push(`is:${col}:${val === null ? "null" : String(val)}`);
      return this;
    },
    lt(col: string, val: string) {
      calls.push(`lt:${col}:${val}`);
      return this;
    },
    lte(col: string, val: string) {
      calls.push(`lte:${col}:${val}`);
      return this;
    },
    gt(col: string, val: string) {
      calls.push(`gt:${col}:${val}`);
      return this;
    },
    gte(col: string, val: string) {
      calls.push(`gte:${col}:${val}`);
      return this;
    },
    filter(col: string, op: string, val: string) {
      calls.push(`filter:${col}:${op}:${val}`);
      return this;
    },
    or(expression: string) {
      calls.push(`or:${expression}`);
      return this;
    }
  };
  const steps = buildInboxFilterQuerySteps({
    leadManagementStatus: "WON",
    sla: "overdue",
    waiting: "needs_response"
  });
  applyInboxFilterQuerySteps(q, steps);
  assert.equal(calls.some((c) => c.includes("leads.status:eq:WON")), true);
  assert.equal(calls.some((c) => c.startsWith("lt:sla_due_at:")), true);
  assert.equal(calls.some((c) => c.startsWith("or:")), true);
});

test("parseConversationsListQuery preserves followUp none", () => {
  const parsed = parseConversationsListQuery({ limit: "10", followUp: "none" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.inboxFilters, { followUp: "none" });
});

test("parseConversationsListQuery preserves sla none", () => {
  const parsed = parseConversationsListQuery({ limit: "10", sla: "none" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.inboxFilters, { sla: "none" });
});

test("buildInboxFilterQuerySteps emits follow_up_none and sla_none", () => {
  const steps = buildInboxFilterQuerySteps({ followUp: "none", sla: "none" });
  assert.deepEqual(steps, [{ kind: "follow_up_none" }, { kind: "sla_none" }]);
});

test("applyInboxFilterQuerySteps applies IS NULL for follow_up_none and sla_none", () => {
  const calls: string[] = [];
  const q = {
    not() {
      return this;
    },
    is(col: string, val: null) {
      calls.push(`is:${col}:${val === null ? "null" : String(val)}`);
      return this;
    },
    lt() {
      return this;
    },
    lte() {
      return this;
    },
    gt() {
      return this;
    },
    gte() {
      return this;
    },
    filter() {
      return this;
    },
    or() {
      return this;
    }
  };
  applyInboxFilterQuerySteps(q, buildInboxFilterQuerySteps({ followUp: "none", sla: "none" }));
  assert.deepEqual(calls, ["is:follow_up_at:null", "is:sla_due_at:null"]);
});

test("buildConversationListInboxFilters strips all but preserves none", () => {
  assert.equal(
    buildConversationListInboxFilters({
      followUp: "all",
      sla: "all",
      waiting: "all"
    }),
    undefined
  );
  assert.deepEqual(
    buildConversationListInboxFilters({
      followUp: "none",
      sla: "none",
      waiting: "all"
    }),
    { followUp: "none", sla: "none" }
  );
});
