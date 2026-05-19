import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamMembersPageSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

test("dashboard shows Team Members navigation only for MANAGER and ADMIN", () => {
  assert.equal(dashboardSource.includes("app-rail-nav"), true);
  assert.equal(dashboardSource.includes('href="/dashboard/team-members"'), true);
  assert.equal(
    dashboardSource.includes("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")") &&
      dashboardSource.indexOf('href="/dashboard/team-members"') >
        dashboardSource.indexOf("(meContext.role === \"MANAGER\" || meContext.role === \"ADMIN\")"),
    true
  );
});

test("Team Members page loads roster via buildTeamMembersSalesAgentsUrl and fetch with listPath", () => {
  assert.equal(teamMembersPageSource.includes("buildTeamMembersSalesAgentsUrl"), true);
  assert.equal(teamMembersPageSource.includes("listPath"), true);
  assert.ok(teamMembersPageSource.includes("await fetch") && teamMembersPageSource.includes("${listPath}"));
});

test("Add Team Member hero button is enabled for managers (no Coming soon / no disabled)", () => {
  assert.equal(teamMembersPageSource.includes("Coming in D1-C"), false);
  assert.equal(teamMembersPageSource.includes("team-members-add-btn"), true);
  const addIdx = teamMembersPageSource.indexOf('className="team-members-add-btn"');
  assert.ok(addIdx >= 0);
  const slice = teamMembersPageSource.slice(addIdx, addIdx + 120);
  assert.equal(slice.includes("disabled"), false);
  assert.equal(slice.includes("openCreate"), true);
});

test("drawer shell markers exist (root, scrim, panel, dialog)", () => {
  assert.equal(teamMembersPageSource.includes("team-members-drawer-root"), true);
  assert.equal(teamMembersPageSource.includes("team-members-drawer-scrim"), true);
  assert.equal(teamMembersPageSource.includes("team-members-drawer-panel"), true);
  assert.equal(teamMembersPageSource.includes('role="dialog"'), true);
});

test("drawer Save and Cancel controls exist with saving label", () => {
  assert.equal(teamMembersPageSource.includes("team-members-drawer-footer"), true);
  assert.equal(teamMembersPageSource.includes("team-members-drawer-cancel"), true);
  assert.equal(teamMembersPageSource.includes("Saving…"), true);
  assert.equal(teamMembersPageSource.includes('{saveBusy ? "Saving…" : "Save"}'), true);
  assert.ok(/\bCancel\b/.test(teamMembersPageSource) && teamMembersPageSource.includes("team-members-drawer-cancel"));
});

test("drawer form includes profile, role, status, assignment, and capacity fields", () => {
  assert.equal(teamMembersPageSource.includes(">Profile<"), true);
  assert.equal(teamMembersPageSource.includes(">Role &amp; access<"), true);
  assert.equal(teamMembersPageSource.includes(">Assignment settings<"), true);
  assert.equal(teamMembersPageSource.includes(">Capacity limits<"), true);
  assert.equal(teamMembersPageSource.includes("form.name"), true);
  assert.equal(teamMembersPageSource.includes("form.email"), true);
  assert.equal(teamMembersPageSource.includes("form.role"), true);
  assert.equal(teamMembersPageSource.includes("form.status"), true);
  assert.equal(teamMembersPageSource.includes("form.assignmentEnabled"), true);
  assert.equal(teamMembersPageSource.includes("form.assignmentMode"), true);
  assert.equal(teamMembersPageSource.includes("form.maxActiveConversationsInput"), true);
  assert.equal(teamMembersPageSource.includes("form.maxActiveLeadsInput"), true);
});

test("Team Members page wires POST/PATCH helpers and roster refetch after save", () => {
  assert.equal(teamMembersPageSource.includes("buildCreateTeamMemberApiPayload"), true);
  assert.equal(teamMembersPageSource.includes("buildPatchTeamMemberBody"), true);
  assert.equal(teamMembersPageSource.includes('"/api/sales-agents"'), true);
  assert.equal(teamMembersPageSource.includes("/api/sales-agents/${encodeURIComponent(drawerMemberId)}"), true);
  assert.equal(teamMembersPageSource.includes("await loadMembers()"), true);
});

test("row activate and deactivate call PATCH with ACTIVE and INACTIVE", () => {
  assert.equal(teamMembersPageSource.includes("void patchStatus(row, \"ACTIVE\")"), true);
  assert.equal(teamMembersPageSource.includes("void patchStatus(row, \"INACTIVE\")"), true);
  assert.equal(teamMembersPageSource.includes('await apiJson(`/api/sales-agents/${encodeURIComponent(m.id)}`, "PATCH", { status })'), true);
});

test("Team Members page imports permission helpers for roster actions", () => {
  assert.equal(teamMembersPageSource.includes("canManageTeamMemberRow"), true);
  assert.equal(teamMembersPageSource.includes("canDeactivateTeamMemberRow"), true);
});

test("SALES access denied and roster fetch gated to MANAGER/ADMIN in loadMembers", () => {
  assert.equal(teamMembersPageSource.includes("Access denied"), true);
  assert.equal(teamMembersPageSource.includes("Sales Managers and Admins only"), true);
  assert.equal(teamMembersPageSource.includes("canManageTeam"), true);
  assert.equal(teamMembersPageSource.includes('if (me.role !== "MANAGER" && me.role !== "ADMIN") return'), true);
});

test("drawer shows API errors via drawerApiError and team-members-drawer-error", () => {
  assert.equal(teamMembersPageSource.includes("drawerApiError"), true);
  assert.equal(teamMembersPageSource.includes("team-members-drawer-error"), true);
  assert.equal(teamMembersPageSource.includes("setDrawerApiError"), true);
});

test("saveDrawer catch surfaces API messages for duplicate email and other failures", () => {
  assert.ok(teamMembersPageSource.includes("setDrawerApiError(String(e instanceof Error ? e.message : e))"));
});

test("create success uses provisioning copy (no immediate login claim)", () => {
  assert.equal(
    teamMembersPageSource.includes("Team member row created. Sign-in access requires separate user provisioning."),
    true
  );
  assert.equal(teamMembersPageSource.toLowerCase().includes("invitation sent"), false);
  assert.equal(teamMembersPageSource.toLowerCase().includes("log in now"), false);
  assert.equal(teamMembersPageSource.toLowerCase().includes("password created"), false);
});

test("Team Members page has no Delete/Remove user actions as copy", () => {
  assert.equal(/\bDelete\b/.test(teamMembersPageSource), false);
  assert.equal(/\bRemove\b/.test(teamMembersPageSource), false);
});

test("Team Members page does not integrate v0 ChannelIcon or WhatsApp", () => {
  assert.equal(teamMembersPageSource.toLowerCase().includes("channel-icon"), false);
  assert.equal(teamMembersPageSource.includes("ChannelIcon"), false);
  assert.equal(teamMembersPageSource.includes("WhatsApp"), false);
});

test("Team Members page does not reference auto-assignment engine", () => {
  assert.equal(teamMembersPageSource.toLowerCase().includes("assignment engine"), false);
});

test("field-level validation errors use team-members-field-error", () => {
  assert.equal(teamMembersPageSource.includes("team-members-field-error"), true);
  assert.equal(teamMembersPageSource.includes("validateTeamMemberForm"), true);
});

test("no optimistic update naming in Team Members page source", () => {
  assert.equal(teamMembersPageSource.toLowerCase().includes("optimistic"), false);
});

test("roster uses scrollable container for long member lists", () => {
  assert.equal(teamMembersPageSource.includes("team-members-roster-scroll"), true);
  assert.equal(teamMembersPageSource.includes('data-testid="team-members-roster-scroll"'), true);
  const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(globalsCss, /\.team-members-roster-scroll\s*\{[^}]*overflow:\s*auto/);
  assert.match(globalsCss, /\.team-members-main\s*\{[^}]*minmax\(0,\s*1fr\)/);
  assert.match(globalsCss, /\.team-members-main\s*\{[^}]*min-height:\s*0/);
  assert.match(globalsCss, /\.team-members-table-wrap\s*\{[^}]*min-height:\s*0/);
});
