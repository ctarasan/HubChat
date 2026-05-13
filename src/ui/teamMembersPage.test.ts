import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamMembersPageSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

test("dashboard shows Team Members navigation only for MANAGER and ADMIN", () => {
  assert.equal(dashboardSource.includes("dashboard-main-nav"), true);
  assert.equal(dashboardSource.includes('href="/dashboard/team-members"'), true);
  assert.equal(
    dashboardSource.includes("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")") &&
      dashboardSource.indexOf('href="/dashboard/team-members"') >
        dashboardSource.indexOf("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")"),
    true
  );
});

test("Team Members page loads roster via buildTeamMembersSalesAgentsUrl and apiFetch", () => {
  assert.equal(teamMembersPageSource.includes("buildTeamMembersSalesAgentsUrl"), true);
  assert.equal(teamMembersPageSource.includes("await apiFetch(listPath)"), true);
});

test("Team Members page shows placeholder metrics and disabled D1-C actions only", () => {
  assert.equal(teamMembersPageSource.includes("Avg Response: —"), true);
  assert.equal(teamMembersPageSource.includes("Coming in D1-C"), true);
  assert.equal(teamMembersPageSource.includes("disabled title=\"Coming in D1-C\""), true);
});

test("Team Members page denies SALES with access denied copy", () => {
  assert.equal(teamMembersPageSource.includes("Access denied"), true);
  assert.equal(teamMembersPageSource.includes("Sales Managers and Admins only"), true);
  assert.equal(teamMembersPageSource.includes("canManageTeam"), true);
});

test("Team Members page does not integrate v0 ChannelIcon or WhatsApp", () => {
  assert.equal(teamMembersPageSource.toLowerCase().includes("channel-icon"), false);
  assert.equal(teamMembersPageSource.includes("ChannelIcon"), false);
  assert.equal(teamMembersPageSource.includes("WhatsApp"), false);
});
