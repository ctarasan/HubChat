import test from "node:test";
import assert from "node:assert/strict";
import { resolveWorkflowScope } from "./workflowScope.js";

const baseAuth = {
  tenantId: "t1",
  userId: "u1",
  email: "u@example.com"
};

test("SALES forced to mine scope", () => {
  const r = resolveWorkflowScope(
    { ...baseAuth, role: "SALES", salesAgentId: "agent-1" },
    "team"
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.forbidden, true);
});

test("SALES mine uses sales agent id", () => {
  const r = resolveWorkflowScope(
    { ...baseAuth, role: "SALES", salesAgentId: "agent-1" },
    undefined
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.scope, "mine");
    assert.equal(r.assignedAgentId, "agent-1");
  }
});

test("MANAGER defaults to team without assignee filter", () => {
  const r = resolveWorkflowScope({ ...baseAuth, role: "MANAGER", salesAgentId: null }, undefined);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.scope, "team");
    assert.equal(r.assignedAgentId, null);
  }
});

test("MANAGER assignedAgentId query filters agent", () => {
  const r = resolveWorkflowScope(
    { ...baseAuth, role: "ADMIN", salesAgentId: null },
    "team",
    "agent-9"
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.assignedAgentId, "agent-9");
});
