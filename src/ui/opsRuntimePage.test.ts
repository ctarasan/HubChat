import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opsPageSource = readFileSync(new URL("./OpsRuntimePage.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamMembersSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

test("Ops Runtime page uses ops-runtime-root layout and fetches /api/ops/runtime", () => {
  assert.equal(opsPageSource.includes('className="ops-runtime-root"'), true);
  assert.equal(opsPageSource.includes('data-testid="ops-runtime-page"'), true);
  assert.equal(opsPageSource.includes("/api/ops/runtime"), true);
  assert.equal(opsPageSource.includes("parseOpsRuntimeResponse"), true);
});

test("Ops Runtime page is ADMIN-only and does not auto-poll", () => {
  assert.equal(opsPageSource.includes('meContext.role !== "ADMIN"'), true);
  assert.equal(opsPageSource.includes('data-testid="ops-runtime-access-denied"'), true);
  assert.equal(opsPageSource.includes("setInterval"), false);
  assert.equal(opsPageSource.includes("DashboardConversationPollScheduler"), false);
});

test("Ops Runtime copy clarifies global operational health", () => {
  assert.match(opsPageSource, /not tenant sales metrics/i);
  assert.match(opsPageSource, /global/i);
});

test("Ops nav link is ADMIN-only on dashboard and team members", () => {
  assert.equal(dashboardSource.includes('data-testid="nav-ops-runtime"'), true);
  assert.equal(teamMembersSource.includes('data-testid="nav-ops-runtime"'), true);
  assert.equal(dashboardSource.includes('meContext?.role === "ADMIN"'), true);
  const dashOpsIdx = dashboardSource.indexOf('data-testid="nav-ops-runtime"');
  const dashAdminIdx = dashboardSource.lastIndexOf('meContext?.role === "ADMIN"', dashOpsIdx);
  assert.ok(dashAdminIdx >= 0 && dashAdminIdx < dashOpsIdx);
});

test("globals.css shares team-members rail grid and tokens with ops-runtime-root", () => {
  const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(globalsCss, /\.ops-runtime-root\s*\{[^}]*--app-rail-width:\s*64px/s);
  assert.match(globalsCss, /\.ops-runtime-root\s*\{[^}]*grid-template-columns:\s*var\(--app-rail-width\)\s*minmax\(0,\s*1fr\)/s);
});
