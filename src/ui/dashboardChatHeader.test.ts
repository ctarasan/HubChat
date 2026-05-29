import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("compact header shows customer identity, channel, and status badges", () => {
  assert.equal(dashboardSource.includes('data-testid="chat-header-badges"'), true);
  assert.equal(dashboardSource.includes("resolveConversationParticipantName(selectedConversation)"), true);
  assert.equal(dashboardSource.includes("status-pill-conversation"), true);
  assert.equal(dashboardSource.includes("status-pill-lead"), true);
  assert.equal(dashboardSource.includes('data-testid="chat-header-assignment"'), true);
});

test("actions menu opens with test ids and menu container", () => {
  assert.equal(dashboardSource.includes('data-testid="chat-header-actions-open"'), true);
  assert.equal(dashboardSource.includes("chatHeaderActionsOpen"), true);
  assert.equal(dashboardSource.includes('data-testid="chat-header-actions-menu"'), true);
  assert.equal(dashboardSource.includes('data-testid="chat-header-actions-scrim"'), true);
});

test("reassign and unassign flows remain wired", () => {
  assert.equal(dashboardSource.includes("applyConversationAssignment"), true);
  assert.equal(dashboardSource.includes('data-testid="chat-action-reassign"'), true);
  assert.equal(dashboardSource.includes("clearConversationAssignment"), true);
  assert.equal(dashboardSource.includes('data-testid="chat-action-unassign"'), true);
  assert.equal(dashboardSource.includes("assignment-controls"), true);
});

test("conversation and lead status updates remain in actions menu", () => {
  assert.equal(dashboardSource.includes("applyConversationStatus"), true);
  assert.equal(dashboardSource.includes('id="conversation-status-select"'), true);
  assert.equal(dashboardSource.includes("applyConversationLeadStatus"), true);
  assert.equal(dashboardSource.includes('id="lead-status-select"'), true);
  assert.equal(dashboardSource.includes('data-testid="chat-action-mark-qualified"'), true);
});

test("follow-up editor and action remain available", () => {
  assert.equal(dashboardSource.includes('data-testid="chat-action-follow-up"'), true);
  assert.equal(dashboardSource.includes("follow-up-editor-panel"), true);
  assert.equal(dashboardSource.includes("saveConversationFollowUp"), true);
  assert.equal(dashboardSource.includes("buildFollowUpSavePatch"), true);
});

test("SALES and manager permission gating preserved", () => {
  assert.equal(dashboardSource.includes("canShowConversationStatusUpdate"), true);
  assert.equal(dashboardSource.includes("canManageConversationAssignments"), true);
  assert.equal(dashboardSource.includes('meContext.role === "SALES"'), true);
  assert.equal(dashboardSource.includes('meContext.role === "MANAGER"'), true);
  assert.equal(dashboardSource.includes('meContext.role === "ADMIN"'), true);
});

test("header no longer uses sprawling conv-header-toolbar", () => {
  assert.equal(dashboardSource.includes("conv-header-toolbar"), false);
});

test("globals.css defines compact chat header and actions menu", () => {
  assert.match(globalsCss, /\.chat-header-actions-menu\s*\{/);
  assert.match(globalsCss, /\.conv-header-badge-row\s*\{/);
  assert.match(globalsCss, /\.chat-header-row-meta\s*\{/);
});

test("PR #78 filters and PR #79 context panel remain intact", () => {
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer-open"'), true);
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-panel"'), true);
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-marketing"'), true);
  assert.equal(dashboardSource.includes('className="chat-composer"'), true);
});
