import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./WorkQueuePage.tsx", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("./workQueueUi.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./workQueueModel.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("Work Queue page fetches GET workflow summary and items only", () => {
  assert.equal(pageSource.includes('data-testid="work-queue-page"'), true);
  assert.ok(pageSource.includes("buildWorkflowSummaryPath"));
  assert.ok(pageSource.includes("buildWorkflowItemsPath"));
  assert.ok(modelSource.includes('params.set("kind", "follow_up")'));
  assert.equal(pageSource.includes('method: "PATCH"'), false);
  assert.equal(pageSource.includes('method: "POST"'), false);
  assert.equal(pageSource.includes('method: "DELETE"'), false);
});

test("Work Queue page renders summary, list, loading, error, empty states", () => {
  assert.equal(pageSource.includes('data-testid="work-queue-summary"'), true);
  assert.equal(pageSource.includes('data-testid="work-queue-list"'), true);
  assert.equal(pageSource.includes('data-testid="work-queue-loading"'), true);
  assert.equal(pageSource.includes('data-testid="work-queue-load-error"'), true);
  assert.equal(pageSource.includes('data-testid="work-queue-empty"'), true);
});

test("SALES mine-only UI and MANAGER team scope controls", () => {
  assert.equal(pageSource.includes('data-testid="work-queue-sales-hint"'), true);
  assert.equal(pageSource.includes("work-queue-scope-${key}"), true);
  assert.equal(pageSource.includes("canUseWorkQueueTeamScope"), true);
  assert.equal(pageSource.includes("resolveWorkQueueScopeForRole"), true);
});

test("v0 UI components: status badges, channel badges, customer replied chip", () => {
  assert.ok(uiSource.includes("WorkQueueStatusBadge"));
  assert.ok(uiSource.includes("workQueueStatusVisual"));
  assert.ok(modelSource.includes("work-queue-status-overdue"));
  assert.ok(modelSource.includes("work-queue-status-due-today"));
  assert.ok(modelSource.includes("work-queue-status-upcoming"));
  assert.ok(uiSource.includes("WorkQueueChannelBadge"));
  assert.ok(modelSource.includes("work-queue-channel-"));
  assert.ok(modelSource.includes("workQueueChannelVisual"));
  assert.ok(uiSource.includes("work-queue-customer-replied-chip"));
  assert.ok(uiSource.includes("customerRepliedAfterFollowUp"));
  assert.ok(pageSource.includes("WorkQueueItemCard"));
  assert.ok(pageSource.includes("WorkQueueSummaryCardButton"));
});

test("Work Queue row open inbox with external link icon", () => {
  assert.ok(uiSource.includes("buildWorkQueueInboxHref"));
  assert.ok(uiSource.includes("work-queue-open-inbox-primary"));
  assert.ok(uiSource.includes("external-link"));
});

test("Dashboard shows Work Queue nav for authenticated roles", () => {
  assert.equal(dashboardSource.includes("canViewWorkQueueNav"), true);
  assert.equal(dashboardSource.includes('data-testid="nav-work-queue"'), true);
  assert.equal(dashboardSource.includes('href="/dashboard/work-queue"'), true);
});

test("route page re-exports WorkQueuePage", () => {
  const routeSource = readFileSync(
    new URL("../../app/dashboard/work-queue/page.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(routeSource.includes("WorkQueuePage"), true);
});

test("model documents scheduled as filter not row status", () => {
  assert.ok(modelSource.includes("scheduled"));
  assert.ok(modelSource.includes("isWorkflowFollowUpItemStatus"));
  assert.equal(modelSource.includes("WORK_QUEUE_FORBIDDEN_RENDER_KEYS"), true);
});

test("globals.css defines scoped v0 work queue severity and channel classes", () => {
  assert.ok(cssSource.includes(".work-queue-root .work-queue-row-critical"));
  assert.ok(cssSource.includes(".work-queue-root .work-queue-status-overdue"));
  assert.ok(cssSource.includes(".work-queue-root .work-queue-channel-instagram"));
  assert.ok(cssSource.includes(".work-queue-root .work-queue-customer-replied-chip"));
  assert.ok(cssSource.includes(".work-queue-root .work-queue-filter-pill"));
  assert.ok(cssSource.includes(".work-queue-root .work-queue-summary-grid"));
});

test("Work Queue uses filter pills not dashboard-only inbox-filter-btn", () => {
  assert.ok(pageSource.includes("work-queue-filter-pill"));
  assert.ok(pageSource.includes("work-queue-filter-pills"));
  assert.equal(pageSource.includes("inbox-filter-btn"), false);
  assert.ok(pageSource.includes("work-queue-summary-grid"));
  assert.ok(uiSource.includes("work-queue-item-card"));
  assert.ok(uiSource.includes('data-testid="work-queue-customer-replied"'));
});

test("Work Queue item cards render customer avatar with inbox-style fallback", () => {
  assert.ok(uiSource.includes("WorkQueueCustomerAvatar"));
  assert.ok(uiSource.includes("customerProfileImageUrl"));
  assert.ok(uiSource.includes("work-queue-avatar-img"));
  assert.ok(uiSource.includes("work-queue-avatar-fallback"));
  assert.ok(uiSource.includes("work-queue-customer-header"));
  assert.ok(uiSource.includes("work-queue-customer-main"));
  assert.ok(uiSource.includes("onError={() => setBroken(true)}"));
  assert.ok(uiSource.includes("resolveWorkQueueCustomerAvatarPlan"));
  assert.equal(uiSource.includes("external_user_id"), false);
  assert.ok(cssSource.includes(".work-queue-root .work-queue-avatar-img"));
});
