import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationsListQuerySuffix,
  computeInboxFirstPageSummary,
  followUpInboxQueryParam,
  leadStatusInboxQueryParam,
  slaInboxQueryParam
} from "./dashboardInboxFilters.js";

test("inbox filter query params append when not all", () => {
  assert.equal(leadStatusInboxQueryParam("NEW"), "&leadStatus=NEW");
  assert.equal(followUpInboxQueryParam("overdue"), "&followUp=overdue");
  assert.equal(slaInboxQueryParam("due_soon"), "&sla=due_soon");
  assert.equal(leadStatusInboxQueryParam("all"), "");
});

test("buildConversationsListQuerySuffix combines scope status and inbox filters", () => {
  const suffix = buildConversationsListQuerySuffix("MANAGER", {
    inboxScope: "unassigned",
    conversationStatus: "open",
    leadStatus: "CONTACTED",
    followUp: "today",
    sla: "overdue"
  });
  assert.equal(suffix.includes("&scope=unassigned"), true);
  assert.equal(suffix.includes("&status=OPEN"), true);
  assert.equal(suffix.includes("&leadStatus=CONTACTED"), true);
  assert.equal(suffix.includes("&followUp=today"), true);
  assert.equal(suffix.includes("&sla=overdue"), true);
});

test("computeInboxFirstPageSummary counts from loaded rows only", () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const summary = computeInboxFirstPageSummary(
    [
      { assigned_agent_id: null, sla_due_at: "2026-05-15T10:00:00.000Z", follow_up_at: "2026-05-15T18:00:00.000Z" },
      { assigned_agent_id: "agent-1", sla_due_at: null, follow_up_at: "2026-05-14T10:00:00.000Z" },
      { assigned_agent_id: "agent-1", sla_due_at: null, follow_up_at: null }
    ],
    now,
    "agent-1"
  );
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.myAssigned, 2);
  assert.equal(summary.slaOverdue, 1);
  assert.equal(summary.followUpAction, 2);
});
