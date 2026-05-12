import test from "node:test";
import assert from "node:assert/strict";
import {
  canManageConversationAssignments,
  formatSalesAgentDisplayLabel,
  inboxScopeQueryParamFor
} from "./teamInboxDashboardHelpers.js";

test("formatSalesAgentDisplayLabel prefers name then email then id", () => {
  assert.equal(
    formatSalesAgentDisplayLabel({ id: "x", email: "a@b.com", name: "Alice" }),
    "Alice"
  );
  assert.equal(formatSalesAgentDisplayLabel({ id: "x", email: "a@b.com", name: "  " }), "a@b.com");
  assert.equal(formatSalesAgentDisplayLabel({ id: "uuid-1", email: "", name: "" }), "uuid-1");
});

test("inboxScopeQueryParamFor adds scope for managers only", () => {
  assert.equal(inboxScopeQueryParamFor("MANAGER", "all"), "&scope=all");
  assert.equal(inboxScopeQueryParamFor("ADMIN", "unassigned"), "&scope=unassigned");
  assert.equal(inboxScopeQueryParamFor("MANAGER", "assigned_to_me"), "&scope=assigned_to_me");
  assert.equal(inboxScopeQueryParamFor("SALES", "all"), "");
  assert.equal(inboxScopeQueryParamFor("SALES", "assigned_to_me"), "");
});

test("canManageConversationAssignments", () => {
  assert.equal(canManageConversationAssignments("MANAGER"), true);
  assert.equal(canManageConversationAssignments("ADMIN"), true);
  assert.equal(canManageConversationAssignments("SALES"), false);
  assert.equal(canManageConversationAssignments(undefined), false);
});
