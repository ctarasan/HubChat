import test from "node:test";
import assert from "node:assert/strict";
import {
  applyActionFilterPreset,
  assignedAgentIdQueryParam,
  buildConversationsListQuerySuffix,
  channelQueryParam,
  clearAllInboxFilters,
  computeInboxFirstPageSummary,
  conversationStatusQueryParam,
  defaultDashboardInboxFiltersForRole,
  followUpQueryParam,
  hasActiveInboxFilters,
  leadManagementStatusQueryParam,
  listActiveFilterBadges,
  mergeInboxFilters,
  scopeQueryParam,
  slaQueryParam,
  waitingQueryParam
} from "./dashboardInboxFilters.js";

test("frozen contract query params use canonical names", () => {
  assert.equal(scopeQueryParam("MANAGER", "team"), "&scope=team");
  assert.equal(scopeQueryParam("SALES", "all"), "&scope=mine");
  assert.equal(channelQueryParam("FACEBOOK"), "&channel=FACEBOOK");
  assert.equal(conversationStatusQueryParam("OPEN"), "&conversationStatus=OPEN");
  assert.equal(leadManagementStatusQueryParam("IN_PROGRESS"), "&leadManagementStatus=IN_PROGRESS");
  assert.equal(followUpQueryParam("today"), "&followUp=today");
  assert.equal(slaQueryParam("due_soon"), "&sla=due_soon");
  assert.equal(waitingQueryParam("needs_response"), "&waiting=needs_response");
  assert.equal(assignedAgentIdQueryParam("agent-1"), "&assignedAgentId=agent-1");
});

test("buildConversationsListQuerySuffix combines manager filters", () => {
  const suffix = buildConversationsListQuerySuffix("MANAGER", {
    scope: "unassigned",
    channel: "LINE",
    conversationStatus: "OPEN",
    leadManagementStatus: "NEW",
    followUp: "overdue",
    sla: "overdue",
    waiting: "needs_response",
    assignedAgentId: "agent-42",
    includeDisconnectedConnections: false
  });
  assert.match(suffix, /scope=unassigned/);
  assert.match(suffix, /channel=LINE/);
  assert.match(suffix, /conversationStatus=OPEN/);
  assert.match(suffix, /leadManagementStatus=NEW/);
  assert.match(suffix, /followUp=overdue/);
  assert.match(suffix, /sla=overdue/);
  assert.match(suffix, /waiting=needs_response/);
  assert.match(suffix, /assignedAgentId=agent-42/);
  assert.equal(suffix.includes("&status="), false);
  assert.equal(suffix.includes("&leadStatus="), false);
});

test("SALES defaults to scope mine and cannot use team scope in query", () => {
  const defaults = defaultDashboardInboxFiltersForRole("SALES");
  assert.equal(defaults.scope, "mine");
  assert.equal(defaults.includeDisconnectedConnections, false);
  const suffix = buildConversationsListQuerySuffix("SALES", {
    ...defaults,
    scope: "all",
    channel: "INSTAGRAM"
  });
  assert.match(suffix, /scope=mine/);
  assert.match(suffix, /channel=INSTAGRAM/);
  assert.equal(suffix.includes("scope=all"), false);
  assert.equal(suffix.includes("connectionScope"), false);
});

test("MANAGER include disconnected adds connectionScope=all; SALES cannot", () => {
  const managerSuffix = buildConversationsListQuerySuffix("MANAGER", {
    ...defaultDashboardInboxFiltersForRole("MANAGER"),
    includeDisconnectedConnections: true
  });
  assert.match(managerSuffix, /connectionScope=all/);

  const salesSuffix = buildConversationsListQuerySuffix("SALES", {
    ...defaultDashboardInboxFiltersForRole("SALES"),
    includeDisconnectedConnections: true
  });
  assert.equal(salesSuffix.includes("connectionScope"), false);
});

test("applyActionFilterPreset maps action chips to frozen params", () => {
  assert.deepEqual(applyActionFilterPreset("needs_response"), { waiting: "needs_response" });
  assert.deepEqual(applyActionFilterPreset("sla_overdue"), { sla: "overdue" });
  assert.deepEqual(applyActionFilterPreset("follow_up_today"), { followUp: "today" });
});

test("listActiveFilterBadges and clearAllInboxFilters", () => {
  const filters = mergeInboxFilters(defaultDashboardInboxFiltersForRole("MANAGER"), {
    channel: "FACEBOOK",
    waiting: "needs_response"
  });
  const badges = listActiveFilterBadges("MANAGER", filters);
  assert.equal(badges.some((b) => b.key === "channel"), true);
  assert.equal(badges.some((b) => b.key === "waiting"), true);
  assert.equal(hasActiveInboxFilters("MANAGER", filters), true);
  const cleared = clearAllInboxFilters("MANAGER");
  assert.equal(cleared.channel, "all");
  assert.equal(cleared.waiting, "all");
  assert.equal(hasActiveInboxFilters("MANAGER", cleared), false);
});

test("computeInboxFirstPageSummary counts from loaded rows only", () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const summary = computeInboxFirstPageSummary(
    [
      { assigned_agent_id: null, sla_due_at: "2026-05-15T10:00:00.000Z", follow_up_at: "2026-05-15T18:00:00.000Z" },
      { assigned_agent_id: "agent-1", sla_due_at: null, follow_up_at: "2026-05-14T10:00:00.000Z" }
    ],
    now,
    "agent-1"
  );
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.myAssigned, 1);
  assert.equal(summary.slaOverdue, 1);
});
