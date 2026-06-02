import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardNavBundleSource } from "./dashboardNavTestSources.js";

const pageSource = readFileSync(new URL("./AnalyticsPage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./analyticsModel.ts", import.meta.url), "utf8");

test("Analytics page fetches GET /api/analytics/overview only", () => {
  assert.equal(pageSource.includes('data-testid="analytics-page"'), true);
  assert.ok(pageSource.includes("buildAnalyticsOverviewPath"));
  assert.equal(pageSource.includes('method: "PATCH"'), false);
  assert.equal(pageSource.includes('method: "POST"'), false);
  assert.equal(pageSource.includes('method: "DELETE"'), false);
});

test("Analytics page range tabs today 7d 30d", () => {
  assert.ok(pageSource.includes("analytics-range-${opt.value}"));
  assert.ok(pageSource.includes("ANALYTICS_RANGE_OPTIONS"));
});

test("SALES access denied on Analytics page", () => {
  assert.equal(pageSource.includes('data-testid="analytics-access-denied"'), true);
  assert.equal(pageSource.includes("canAccessAnalyticsPage"), true);
  assert.ok(pageSource.includes("คุณไม่มีสิทธิ์เข้าถึงหน้านี้"));
});

test("Analytics page states: loading, error, empty", () => {
  assert.equal(pageSource.includes('data-testid="analytics-loading"'), true);
  assert.equal(pageSource.includes('data-testid="analytics-load-error"'), true);
  assert.equal(pageSource.includes('data-testid="analytics-empty"'), true);
});

test("Analytics uses breach rate percent formatting and rollup labels", () => {
  assert.ok(pageSource.includes("formatBreachRatePercent"));
  assert.ok(pageSource.includes("Follow-up scheduled"));
  assert.ok(pageSource.includes("managementRollupRows"));
});

test("Analytics team workload does not reference resolvedInRange", () => {
  assert.equal(pageSource.includes("resolvedInRange"), false);
  assert.equal(modelSource.includes("resolvedInRange"), false);
});

test("Dashboard shows Analytics nav for MANAGER and ADMIN only", () => {
  assert.equal(dashboardNavBundleSource.includes("canViewAnalyticsNav"), true);
  assert.equal(dashboardNavBundleSource.includes('testId: "nav-analytics"'), true);
  assert.equal(dashboardNavBundleSource.includes('href: "/dashboard/analytics"'), true);
});

test("route page re-exports AnalyticsPage", () => {
  const routeSource = readFileSync(
    new URL("../../app/dashboard/analytics/page.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(routeSource.includes("AnalyticsPage"), true);
});
