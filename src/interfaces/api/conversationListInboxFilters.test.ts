import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInboxFilterQuerySteps,
  buildInboxFilterQuerySteps,
  parseConversationListInboxFilters,
  utcInboxFilterClock
} from "./conversationListInboxFilters.js";

test("parseConversationListInboxFilters returns undefined when empty", () => {
  assert.equal(parseConversationListInboxFilters({}), undefined);
});

test("parseConversationListInboxFilters maps lead follow-up sla", () => {
  assert.deepEqual(parseConversationListInboxFilters({ leadStatus: "NEW", followUp: "overdue", sla: "due_soon" }), {
    leadStatus: "NEW",
    followUp: "overdue",
    sla: "due_soon"
  });
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

test("applyInboxFilterQuerySteps records supabase filter calls", () => {
  const calls: string[] = [];
  const q = {
    not(col: string, op: string, val: unknown) {
      calls.push(`not:${col}:${op}:${String(val)}`);
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
    }
  };
  const steps = buildInboxFilterQuerySteps({ leadStatus: "CONTACTED", sla: "overdue" });
  applyInboxFilterQuerySteps(q, steps);
  assert.equal(calls.some((c) => c.includes("leads.status:eq:CONTACTED")), true);
  assert.equal(calls.some((c) => c.startsWith("lt:sla_due_at:")), true);
});
