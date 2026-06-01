import test from "node:test";
import assert from "node:assert/strict";
import type { WorkflowFollowUpItemDto } from "../domain/workflow.js";
import {
  assertWorkQueueItemSafeForRender,
  assertWorkQueueItemStatuses,
  buildWorkflowItemsPath,
  buildWorkflowSummaryPath,
  buildWorkQueueInboxHref,
  canUseWorkQueueTeamScope,
  defaultWorkQueueScope,
  formatAssignedAgentDisplay,
  formatWorkflowDueAt,
  isWorkflowFollowUpItemStatus,
  mapWorkflowLoadError,
  resolveWorkQueueScopeForRole,
  summaryCardsFromCounts,
  workflowPriorityRowClassName,
  workflowStatusBadgeClassName,
  workflowStatusLabel
} from "./workQueueModel.js";

test("summaryCardsFromCounts maps scheduled as filter dimension", () => {
  const cards = summaryCardsFromCounts({ scheduled: 10, overdue: 2, dueToday: 1, upcoming: 7 });
  assert.equal(cards.length, 4);
  assert.equal(cards.find((c) => c.id === "scheduled")?.statusFilter, "scheduled");
  assert.equal(cards.find((c) => c.id === "overdue")?.severity, "critical");
});

test("workflow status and priority mapping", () => {
  assert.equal(workflowStatusLabel("overdue"), "Overdue");
  assert.equal(workflowStatusLabel("due_today"), "Due today");
  assert.equal(workflowStatusLabel("upcoming"), "Upcoming");
  assert.ok(workflowStatusBadgeClassName("overdue").includes("followup-overdue"));
  assert.equal(workflowPriorityRowClassName("critical"), "work-queue-item work-queue-item-critical");
  assert.equal(workflowPriorityRowClassName("warn"), "work-queue-item work-queue-item-warn");
  assert.equal(workflowPriorityRowClassName("info"), "work-queue-item work-queue-item-info");
});

test("scheduled is not a valid item status", () => {
  assert.equal(isWorkflowFollowUpItemStatus("overdue"), true);
  assert.equal(isWorkflowFollowUpItemStatus("scheduled"), false);
});

test("customerRepliedAfterFollowUp flag only on item", () => {
  const item: WorkflowFollowUpItemDto = {
    id: "follow_up:c1",
    kind: "FOLLOW_UP",
    status: "overdue",
    priority: "critical",
    conversationId: "c1",
    leadId: "l1",
    channelType: "LINE",
    assignedAgentId: "a1",
    assignedAgentDisplayName: null,
    customerDisplayName: "Pat",
    dueAt: "2026-05-14T10:00:00.000Z",
    leadManagementStatus: "FOLLOW_UP",
    conversationStatus: "OPEN",
    flags: { customerRepliedAfterFollowUp: true },
    reasonCode: "CUSTOMER_REPLIED_AFTER_FOLLOW_UP",
    reasonLabel: "Customer replied after follow-up was scheduled",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z"
  };
  assertWorkQueueItemStatuses([item]);
  assertWorkQueueItemSafeForRender(item);
  assert.equal(item.flags.customerRepliedAfterFollowUp, true);
  assert.equal(JSON.stringify(item).includes("follow_up_note"), false);
});

test("formatAssignedAgentDisplay fallback", () => {
  assert.equal(formatAssignedAgentDisplay(null), "Unassigned");
  assert.equal(formatAssignedAgentDisplay("  Sam  "), "Sam");
});

test("formatWorkflowDueAt safe fallback", () => {
  assert.equal(formatWorkflowDueAt(null), "—");
  assert.equal(formatWorkflowDueAt("not-a-date"), "—");
  assert.notEqual(formatWorkflowDueAt("2026-05-15T12:00:00.000Z"), "—");
});

test("role-specific scope controls", () => {
  assert.equal(defaultWorkQueueScope("SALES"), "mine");
  assert.equal(defaultWorkQueueScope("MANAGER"), "team");
  assert.equal(resolveWorkQueueScopeForRole("SALES", "team"), "mine");
  assert.equal(resolveWorkQueueScopeForRole("MANAGER", undefined), "team");
  assert.equal(canUseWorkQueueTeamScope("SALES"), false);
  assert.equal(canUseWorkQueueTeamScope("ADMIN"), true);
});

test("buildWorkflow paths", () => {
  assert.equal(buildWorkflowSummaryPath("team"), "/api/workflow/summary?scope=team");
  const items = buildWorkflowItemsPath({
    scope: "mine",
    status: "overdue",
    channel: "LINE",
    limit: 25
  });
  assert.ok(items.includes("kind=follow_up"));
  assert.ok(items.includes("scope=mine"));
  assert.ok(items.includes("status=overdue"));
  assert.ok(items.includes("channel=LINE"));
});

test("buildWorkQueueInboxHref uses dashboard conversation pattern", () => {
  assert.equal(buildWorkQueueInboxHref("conv-1"), "/dashboard?conversationId=conv-1");
});

test("mapWorkflowLoadError is operator-safe", () => {
  assert.equal(mapWorkflowLoadError(403, {}), "You do not have permission to view this work queue scope.");
  assert.equal(mapWorkflowLoadError(500, {}), "Could not load work queue. Please try again.");
  assert.equal(mapWorkflowLoadError(400, { error: "x".repeat(300) }).length < 80, true);
});
