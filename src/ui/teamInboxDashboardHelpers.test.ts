import test from "node:test";
import assert from "node:assert/strict";
import {
  canManageConversationAssignments,
  formatSalesAgentDisplayLabel,
  getComposerOwnershipState,
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

const baseOwnership = {
  hasSelectedConversation: true,
  selectedAssignedAgentId: "agent-1" as string | null
};

test("getComposerOwnershipState MANAGER can reply", () => {
  const r = getComposerOwnershipState({ ...baseOwnership, role: "MANAGER", salesAgentId: null });
  assert.equal(r.canReplyByOwnership, true);
  assert.equal(r.reason, null);
});

test("getComposerOwnershipState ADMIN can reply", () => {
  const r = getComposerOwnershipState({ ...baseOwnership, role: "ADMIN", salesAgentId: null });
  assert.equal(r.canReplyByOwnership, true);
  assert.equal(r.reason, null);
});

test("getComposerOwnershipState SALES assigned to self can reply", () => {
  const r = getComposerOwnershipState({
    ...baseOwnership,
    role: "SALES",
    salesAgentId: "agent-1",
    selectedAssignedAgentId: "agent-1"
  });
  assert.equal(r.canReplyByOwnership, true);
  assert.equal(r.reason, null);
});

test("getComposerOwnershipState SALES missing salesAgentId cannot reply", () => {
  const r = getComposerOwnershipState({
    ...baseOwnership,
    role: "SALES",
    salesAgentId: null,
    selectedAssignedAgentId: "agent-1"
  });
  assert.equal(r.canReplyByOwnership, false);
  assert.equal(r.reason, "Your sales agent profile is not active for this tenant.");
});

test("getComposerOwnershipState SALES on unassigned conversation cannot reply", () => {
  const r = getComposerOwnershipState({
    ...baseOwnership,
    role: "SALES",
    salesAgentId: "agent-1",
    selectedAssignedAgentId: null
  });
  assert.equal(r.canReplyByOwnership, false);
  assert.equal(r.reason, "This conversation is not assigned to you yet.");
});

test("getComposerOwnershipState SALES assigned to another agent cannot reply", () => {
  const r = getComposerOwnershipState({
    ...baseOwnership,
    role: "SALES",
    salesAgentId: "agent-1",
    selectedAssignedAgentId: "agent-2"
  });
  assert.equal(r.canReplyByOwnership, false);
  assert.equal(r.reason, "This conversation is assigned to another sales agent.");
});

test("getComposerOwnershipState no selected conversation", () => {
  const r = getComposerOwnershipState({
    role: "SALES",
    salesAgentId: "agent-1",
    selectedAssignedAgentId: "agent-1",
    hasSelectedConversation: false
  });
  assert.equal(r.canReplyByOwnership, false);
  assert.equal(r.reason, "Select a conversation to reply.");
});

test("getComposerOwnershipState invalid role uses fallback", () => {
  const r = getComposerOwnershipState({
    ...baseOwnership,
    role: undefined,
    salesAgentId: "x"
  });
  assert.equal(r.canReplyByOwnership, false);
  assert.equal(r.reason, "You are not allowed to reply to this conversation.");
});
