import test from "node:test";
import assert from "node:assert/strict";
import { resolveConversationListScope } from "./conversationListScope.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT = "11111111-1111-4111-8111-111111111111";

function auth(overrides: Partial<{ role: "SALES" | "MANAGER" | "ADMIN"; salesAgentId: string | null }>) {
  return {
    tenantId: TENANT,
    userId: "user-1",
    email: "u@example.com",
    role: overrides.role ?? "SALES",
    salesAgentId: overrides.salesAgentId !== undefined ? overrides.salesAgentId : AGENT
  };
}

test("MANAGER no scope resolves to no assignment filter", () => {
  const r = resolveConversationListScope(auth({ role: "MANAGER", salesAgentId: AGENT }), undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.filter.kind, "none");
});

test("MANAGER scope=all resolves to no assignment filter", () => {
  const r = resolveConversationListScope(auth({ role: "MANAGER" }), "all");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.filter.kind, "none");
});

test("MANAGER scope=unassigned resolves to unassigned filter", () => {
  const r = resolveConversationListScope(auth({ role: "ADMIN" }), "unassigned");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.filter.kind, "unassigned");
});

test("MANAGER scope=assigned_to_me resolves when salesAgentId present", () => {
  const r = resolveConversationListScope(auth({ role: "MANAGER", salesAgentId: AGENT }), "assigned_to_me");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.filter.kind, "assigned_to_agent");
    if (r.filter.kind === "assigned_to_agent") assert.equal(r.filter.agentId, AGENT);
  }
});

test("MANAGER scope=assigned_to_me forbidden when salesAgentId missing", () => {
  const r = resolveConversationListScope(auth({ role: "MANAGER", salesAgentId: null }), "assigned_to_me");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.message.includes("assigned_to_me"));
});

test("SALES no scope defaults to assigned_to_me", () => {
  const r = resolveConversationListScope(auth({ role: "SALES", salesAgentId: AGENT }), undefined);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.filter.kind, "assigned_to_agent");
    if (r.filter.kind === "assigned_to_agent") assert.equal(r.filter.agentId, AGENT);
  }
});

test("SALES scope=assigned_to_me", () => {
  const r = resolveConversationListScope(auth({ role: "SALES" }), "assigned_to_me");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.filter.kind, "assigned_to_agent");
});

test("SALES missing salesAgentId is forbidden", () => {
  const r = resolveConversationListScope(auth({ role: "SALES", salesAgentId: null }), undefined);
  assert.equal(r.ok, false);
});

test("SALES scope=all is forbidden", () => {
  const r = resolveConversationListScope(auth({ role: "SALES", salesAgentId: AGENT }), "all");
  assert.equal(r.ok, false);
});

test("SALES scope=unassigned is forbidden", () => {
  const r = resolveConversationListScope(auth({ role: "SALES", salesAgentId: AGENT }), "unassigned");
  assert.equal(r.ok, false);
});
