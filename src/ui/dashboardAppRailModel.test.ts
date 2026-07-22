import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardNavItems } from "./dashboardAppRailModel.js";

test("buildDashboardNavItems ADMIN sees ops analytics and channels", () => {
  const items = buildDashboardNavItems({ role: "ADMIN" });
  const ids = items.map((i) => i.id);
  assert.equal(ids.includes("ops"), true);
  assert.equal(ids.includes("analytics"), true);
  assert.equal(ids.includes("channels"), true);
  assert.equal(items.some((i) => i.label === "Settings"), false);
});

test("buildDashboardNavItems SALES hides team ops analytics sla", () => {
  const items = buildDashboardNavItems({ role: "SALES" });
  const ids = items.map((i) => i.id);
  assert.equal(ids.includes("inbox"), true);
  assert.equal(ids.includes("leads"), true);
  assert.equal(ids.includes("work-queue"), true);
  assert.equal(ids.includes("team"), false);
  assert.equal(ids.includes("ops"), false);
  assert.equal(ids.includes("analytics"), false);
  assert.equal(ids.includes("sla"), false);
});

test("buildDashboardNavItems MANAGER sees team sla analytics not ops", () => {
  const items = buildDashboardNavItems({ role: "MANAGER" });
  const ids = items.map((i) => i.id);
  assert.equal(ids.includes("team"), true);
  assert.equal(ids.includes("sla"), true);
  assert.equal(ids.includes("analytics"), true);
  assert.equal(ids.includes("ops"), false);
});

test("buildDashboardNavItems inbox placeholders add disabled channels without Settings", () => {
  const items = buildDashboardNavItems({ role: "SALES", showInboxPlaceholders: true });
  const channels = items.find((i) => i.id === "channels");
  assert.equal(channels?.disabled, true);
  assert.equal(items.some((i) => i.label === "Settings"), false);
  assert.equal(items.some((i) => i.testId === "nav-settings-disabled"), false);
});

test("buildDashboardNavItems lower main order keeps Inbox through Channels unchanged", () => {
  const ids = buildDashboardNavItems({ role: "ADMIN" }).map((i) => i.id);
  assert.deepEqual(ids, ["inbox", "team", "ops", "leads", "sla", "analytics", "work-queue", "channels"]);
});

test("buildDashboardNavItems nav entries use SVG icons not abbreviations", () => {
  const items = buildDashboardNavItems({ role: "ADMIN" });
  for (const item of items) {
    assert.ok(item.icon.length > 0);
    assert.equal(item.icon, item.icon.toLowerCase());
  }
});
