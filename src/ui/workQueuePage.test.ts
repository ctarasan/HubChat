import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./WorkQueuePage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./workQueueModel.ts", import.meta.url), "utf8");

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

test("Work Queue row open inbox and customer replied indicator", () => {
  assert.ok(pageSource.includes("buildWorkQueueInboxHref"));
  assert.ok(pageSource.includes("work-queue-open-inbox"));
  assert.ok(pageSource.includes("customerRepliedAfterFollowUp"));
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
