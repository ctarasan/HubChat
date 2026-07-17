import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
const iconsSource = readFileSync(new URL("./dashboardNavIcons.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("DashboardAppRail renders AppearanceMenu in the shared footer", () => {
  assert.ok(railSource.includes("AppearanceMenu"));
  assert.ok(railSource.includes('className="app-rail-footer"'));
});

test("DashboardAppRail renders line SVG icons in nav slots", () => {
  assert.ok(railSource.includes("DashboardNavIcon"));
  assert.ok(railSource.includes('className="app-rail-nav-icon"'));
  assert.ok(iconsSource.includes('stroke: "currentColor"'));
  assert.ok(iconsSource.includes('case "inbox"'));
  assert.ok(iconsSource.includes('case "users"'));
});

test("Dashboard pages use shared DashboardAppRail component", () => {
  const dashboardPage = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
  assert.ok(dashboardPage.includes("<DashboardAppRail"));
  assert.equal(dashboardPage.includes(">IN<"), false);
  assert.equal(dashboardPage.includes(">TM<"), false);
});

test("globals.css styles v0 rail active state and SVG icon slots", () => {
  assert.ok(globalsSource.includes(".app-rail-nav-item-active"));
  assert.ok(globalsSource.includes(".dashboard-nav-icon"));
  assert.ok(globalsSource.includes(".app-rail-nav-icon .dashboard-nav-icon"));
});

test("DashboardAppRail renders SmartKorp compact brand mark", () => {
  assert.ok(railSource.includes("app-rail-brand-mark"));
  assert.ok(railSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"));
  assert.equal(railSource.includes(">SK<"), false);
});
