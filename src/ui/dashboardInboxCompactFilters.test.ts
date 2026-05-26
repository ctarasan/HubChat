import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("dashboard compact inbox keeps quick scope filters for managers", () => {
  assert.equal(dashboardSource.includes('data-testid={`inbox-scope-${key}`}'), true);
  assert.equal(dashboardSource.includes('["mine", "My inbox"]'), true);
  assert.equal(dashboardSource.includes('["team", "Team inbox"]'), true);
  assert.equal(dashboardSource.includes('["unassigned", "Unassigned"]'), true);
  assert.equal(dashboardSource.includes('patchInboxFilters({ scope: key })'), true);
});

test("dashboard compact inbox keeps quick conversation status filters", () => {
  assert.equal(dashboardSource.includes('data-testid={`inbox-status-${key.toLowerCase()}`}'), true);
  assert.equal(dashboardSource.includes("conversation-status-filter-bar"), true);
  assert.equal(dashboardSource.includes("patchInboxFilters({ conversationStatus:"), true);
});

test("dashboard advanced filters use drawer with apply and done", () => {
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer-open"'), true);
  assert.equal(dashboardSource.includes("openInboxFiltersDrawer"), true);
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer"'), true);
  assert.equal(dashboardSource.includes("applyInboxFiltersDrawer"), true);
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer-apply"'), true);
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer-done"'), true);
  assert.equal(dashboardSource.includes("inboxFiltersDrawerDraft"), true);
  assert.equal(dashboardSource.includes("patchInboxFiltersDrawer"), true);
});

test("dashboard channel and action filters moved to drawer draft", () => {
  const drawerStart = dashboardSource.indexOf('data-testid="inbox-filters-drawer"');
  assert.ok(drawerStart >= 0);
  const compactEnd = dashboardSource.indexOf("inboxFiltersDrawerOpen");
  const compactBlock = dashboardSource.slice(
    dashboardSource.indexOf("inbox-compact-filters"),
    compactEnd > 0 ? compactEnd : drawerStart
  );
  assert.equal(compactBlock.includes('aria-label="Channel filter"'), false);
  assert.equal(compactBlock.includes("inbox-action-needs-response"), false);
  const drawerBlock = dashboardSource.slice(drawerStart, drawerStart + 12000);
  assert.equal(drawerBlock.includes("inbox-channel-"), true);
  assert.equal(drawerBlock.includes("inbox-action-needs-response"), true);
  assert.equal(drawerBlock.includes('data-testid="manager-inbox-filters"'), true);
});

test("dashboard active filter chips clear individual filters", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-inbox-active-filters"'), true);
  assert.equal(dashboardSource.includes("patchInboxFilters(badge.clearPatch)"), true);
  assert.equal(dashboardSource.includes('data-testid="inbox-clear-all-filters"'), true);
});

test("dashboard does not use details/summary for more filters", () => {
  assert.equal(dashboardSource.includes("inbox-more-filters"), false);
  assert.equal(dashboardSource.includes("<details"), false);
});

test("dashboard preserves frozen conversations query builder", () => {
  assert.equal(dashboardSource.includes("buildConversationsListQuerySuffix"), true);
  assert.equal(dashboardSource.includes("inboxFiltersRef.current"), true);
});

test("dashboard marketing timeline and conversation polling unchanged", () => {
  assert.equal(dashboardSource.includes("MarketingTimelinePanel"), true);
  assert.equal(dashboardSource.includes("fetchMarketingEventsList"), true);
  assert.equal(dashboardSource.includes("DashboardConversationPollScheduler"), true);
  const drawerBlock = dashboardSource.slice(
    dashboardSource.indexOf("inboxFiltersDrawerOpen"),
    dashboardSource.indexOf("inboxFiltersDrawerOpen") + 800
  );
  assert.equal(drawerBlock.includes("setInterval"), false);
});

test("globals.css defines inbox filters drawer layout", () => {
  assert.match(globalsCss, /\.inbox-filters-drawer-root\s*\{/);
  assert.match(globalsCss, /\.inbox-filters-drawer-panel\s*\{/);
  assert.match(globalsCss, /\.inbox-compact-toolbar\s*\{/);
});
