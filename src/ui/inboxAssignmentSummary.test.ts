import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatInboxAssignmentSummary } from "./inboxAssignmentSummary.js";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const composerSource = readFileSync(new URL("./chatComposerModel.ts", import.meta.url), "utf8");
const entitiesSource = readFileSync(new URL("../domain/entities.ts", import.meta.url), "utf8");

test("assigned card/header shows assignee name without ASSIGNED or NORMAL", () => {
  const line = formatInboxAssignmentSummary({
    assignedDisplayName: "Sale One",
    assignmentStatus: "ASSIGNED",
    priority: "NORMAL"
  });
  assert.equal(line, "Assigned: Sale One");
  assert.equal(line.includes("ASSIGNED"), false);
  assert.equal(line.includes("NORMAL"), false);
  assert.equal(line.includes(" · "), false);
});

test("assigned summary has no dangling separator", () => {
  const line = formatInboxAssignmentSummary({
    assignedDisplayName: "Sale One",
    assignmentStatus: "ASSIGNED",
    priority: "NORMAL"
  });
  assert.equal(line.endsWith(" ·"), false);
  assert.equal(line.endsWith("·"), false);
  assert.equal(line.includes("Sale One ·"), false);
});

test("unassigned keeps meaningful Unassigned wording without redundant tokens", () => {
  const line = formatInboxAssignmentSummary({
    assignedDisplayName: null,
    assignmentStatus: "UNASSIGNED",
    priority: "NORMAL"
  });
  assert.equal(line, "Unassigned");
  assert.equal(line.startsWith("Assigned:"), false);
  assert.equal(line.includes("NORMAL"), false);
});

test("empty assignee name is treated as unassigned", () => {
  assert.equal(
    formatInboxAssignmentSummary({
      assignedDisplayName: "   ",
      assignmentStatus: "UNASSIGNED",
      priority: "NORMAL"
    }),
    "Unassigned"
  );
});

test("preserves exceptional non-NORMAL priority when present", () => {
  assert.equal(
    formatInboxAssignmentSummary({
      assignedDisplayName: "Sale One",
      assignmentStatus: "ASSIGNED",
      priority: "HIGH"
    }),
    "Assigned: Sale One · HIGH"
  );
  assert.equal(
    formatInboxAssignmentSummary({
      assignedDisplayName: null,
      assignmentStatus: "UNASSIGNED",
      priority: "URGENT"
    }),
    "Unassigned · URGENT"
  );
});

test("preserves meaningful non-default assignment status when present", () => {
  assert.equal(
    formatInboxAssignmentSummary({
      assignedDisplayName: "Sale One",
      assignmentStatus: "REASSIGNED",
      priority: "NORMAL"
    }),
    "Assigned: Sale One · REASSIGNED"
  );
  assert.equal(
    formatInboxAssignmentSummary({
      assignedDisplayName: null,
      assignmentStatus: "UNASSIGNED_AGAIN",
      priority: "NORMAL"
    }),
    "Unassigned · UNASSIGNED_AGAIN"
  );
});

test("Dashboard wires shared formatter for card and header", () => {
  assert.match(dashboardSource, /formatInboxAssignmentSummary/);
  assert.match(dashboardSource, /from "\.\/inboxAssignmentSummary\.js"/);
  assert.match(dashboardSource, /assignmentSummary=\{formatLeadAssignmentSummary\(item\)\}/);
  assert.match(dashboardSource, /data-testid="chat-header-assignment"/);
  assert.doesNotMatch(
    dashboardSource,
    /Assigned: \$\{resolveAgentLabel\([^)]+\)\} · \$\{/
  );
  assert.doesNotMatch(dashboardSource, /Unassigned · \$\{/);
});

test("OPEN NEW SLA waiting badges remain independent of assignment summary", () => {
  assert.match(dashboardSource, /status-pill-conversation/);
  assert.match(dashboardSource, /status-pill-lead/);
  assert.match(dashboardSource, /resolveInboxBadgeDescriptors/);
  assert.match(dashboardSource, /conversation-list-inbox-badges/);
  assert.match(dashboardSource, /data-testid="chat-header-badges"/);
});

test("underlying assignment and priority model fields remain in domain and lead list", () => {
  assert.match(entitiesSource, /ConversationPriority/);
  assert.match(entitiesSource, /"NORMAL"/);
  assert.match(entitiesSource, /"ASSIGNED"/);
  assert.match(composerSource, /latestAssignmentStatus/);
  assert.match(composerSource, /latestPriority/);
  assert.match(composerSource, /latestAssignedAgentId/);
  assert.match(dashboardSource, /latestAssignmentStatus/);
  assert.match(dashboardSource, /latestPriority/);
});

test("Leads page ASSIGNED option and lead-status labels are not removed", () => {
  const leadsPage = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
  const leadStatus = readFileSync(new URL("./leadStatusEditorModel.ts", import.meta.url), "utf8");
  assert.match(leadsPage, /value="ASSIGNED"/);
  assert.match(leadStatus, /ASSIGNED:\s*"Assigned"/);
});
