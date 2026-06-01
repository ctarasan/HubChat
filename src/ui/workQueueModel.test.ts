import test from "node:test";
import assert from "node:assert/strict";
import type { WorkflowFollowUpItemDto } from "../domain/workflow.js";
import {
  WORK_QUEUE_CUSTOMER_REPLIED_COPY,
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
  normalizeWorkQueueProfileImageUrl,
  resolveWorkQueueCustomerAvatarPlan,
  resolveWorkQueueScopeForRole,
  summaryCardsFromCounts,
  workQueueChannelVisual,
  workQueueRowClassName,
  workQueueStatusVisual,
  workflowPriorityRowClassName,
  workflowStatusLabel
} from "./workQueueModel.js";

test("summaryCardsFromCounts maps scheduled as filter dimension with v0 test ids", () => {
  const cards = summaryCardsFromCounts({ scheduled: 10, overdue: 2, dueToday: 1, upcoming: 7 });
  assert.equal(cards.length, 4);
  assert.equal(cards.find((c) => c.id === "scheduled")?.statusFilter, "scheduled");
  assert.equal(cards.find((c) => c.id === "overdue")?.summaryTestId, "work-queue-summary-overdue");
  assert.equal(cards.find((c) => c.id === "due-today")?.iconName, "clock");
  assert.ok(cards.find((c) => c.id === "scheduled")?.cardClassName.includes("work-queue-summary-neutral"));
});

test("workQueueStatusVisual mapping for overdue, due_today, upcoming", () => {
  const overdue = workQueueStatusVisual("overdue");
  assert.equal(overdue.label, "Overdue");
  assert.equal(overdue.iconName, "alert-triangle");
  assert.ok(overdue.badgeClassName.includes("work-queue-status-overdue"));
  assert.ok(overdue.rowClassName.includes("work-queue-row-critical"));
  assert.equal(overdue.statusTestId, "work-queue-status-overdue");

  const today = workQueueStatusVisual("due_today");
  assert.equal(today.iconName, "clock");
  assert.ok(today.badgeClassName.includes("work-queue-status-due-today"));

  const upcoming = workQueueStatusVisual("upcoming");
  assert.equal(upcoming.iconName, "calendar-days");
  assert.ok(upcoming.badgeClassName.includes("work-queue-status-upcoming"));
});

test("workQueueChannelVisual mapping", () => {
  assert.equal(workQueueChannelVisual("LINE").channelTestId, "work-queue-channel-line");
  assert.ok(workQueueChannelVisual("FACEBOOK").badgeClassName.includes("work-queue-channel-facebook"));
  assert.ok(workQueueChannelVisual("INSTAGRAM").badgeClassName.includes("work-queue-channel-instagram"));
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
    customerProfileImageUrl: null,
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

test("WORK_QUEUE_CUSTOMER_REPLIED_COPY is informational", () => {
  assert.ok(WORK_QUEUE_CUSTOMER_REPLIED_COPY.includes("scheduled"));
  assert.equal(WORK_QUEUE_CUSTOMER_REPLIED_COPY.toLowerCase().includes("clear"), false);
  assert.equal(WORK_QUEUE_CUSTOMER_REPLIED_COPY.toLowerCase().includes("auto"), false);
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

test("workQueueRowClassName follows status not priority label alone", () => {
  assert.ok(workQueueRowClassName("overdue").includes("work-queue-row-critical"));
  assert.ok(workflowPriorityRowClassName("critical", "due_today").includes("work-queue-row-warn"));
  assert.equal(workflowStatusLabel("upcoming"), "Upcoming");
});

test("mapWorkflowLoadError is operator-safe", () => {
  assert.equal(mapWorkflowLoadError(403, {}), "You do not have permission to view this work queue scope.");
  assert.equal(mapWorkflowLoadError(500, {}), "Could not load work queue. Please try again.");
  assert.equal(mapWorkflowLoadError(400, { error: "x".repeat(300) }).length < 80, true);
});

test("normalizeWorkQueueProfileImageUrl accepts HTTPS only", () => {
  assert.equal(
    normalizeWorkQueueProfileImageUrl("https://cdn.example/avatar.jpg"),
    "https://cdn.example/avatar.jpg"
  );
  assert.equal(normalizeWorkQueueProfileImageUrl("http://insecure.example/x.jpg"), null);
  assert.equal(normalizeWorkQueueProfileImageUrl(null), null);
  assert.equal(normalizeWorkQueueProfileImageUrl("  "), null);
});

test("resolveWorkQueueCustomerAvatarPlan uses image, initials, or generic fallback", () => {
  const image = resolveWorkQueueCustomerAvatarPlan("Pat", "https://cdn.example/p.jpg");
  assert.equal(image.kind, "image");
  if (image.kind === "image") assert.equal(image.url, "https://cdn.example/p.jpg");

  const initials = resolveWorkQueueCustomerAvatarPlan("Ada Lovelace", null);
  assert.equal(initials.kind, "initials");
  if (initials.kind === "initials") assert.equal(initials.initials, "AL");

  const generic = resolveWorkQueueCustomerAvatarPlan("", null);
  assert.equal(generic.kind, "generic");
});

test("work queue item with profile URL passes safe-render guard", () => {
  const item: WorkflowFollowUpItemDto = {
    id: "follow_up:c2",
    kind: "FOLLOW_UP",
    status: "upcoming",
    priority: "info",
    conversationId: "c2",
    leadId: "l2",
    channelType: "INSTAGRAM",
    assignedAgentId: null,
    assignedAgentDisplayName: null,
    customerDisplayName: "IG Lead",
    customerProfileImageUrl: "https://cdn.example/ig.jpg",
    dueAt: "2026-06-01T10:00:00.000Z",
    leadManagementStatus: null,
    conversationStatus: "OPEN",
    flags: { customerRepliedAfterFollowUp: false },
    reasonCode: "FOLLOW_UP_UPCOMING",
    reasonLabel: "Follow-up upcoming",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z"
  };
  assertWorkQueueItemSafeForRender(item);
  assert.equal(JSON.stringify(item).includes("external_user_id"), false);
});
