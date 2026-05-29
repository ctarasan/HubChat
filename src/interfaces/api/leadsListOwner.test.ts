import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeadsListAssignmentFilter } from "./leadsListOwner.js";

const AGENT = "11111111-1111-4111-8111-111111111111";

test("SALES always resolves to assigned agent filter", () => {
  const r = resolveLeadsListAssignmentFilter(
    {
      tenantId: "t",
      userId: "u",
      email: "s@x.com",
      role: "SALES",
      salesAgentId: AGENT
    },
    undefined
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.filter, { kind: "assigned_to_agent", agentId: AGENT });
});

test("SALES cannot use owner=unassigned", () => {
  const r = resolveLeadsListAssignmentFilter(
    {
      tenantId: "t",
      userId: "u",
      email: "s@x.com",
      role: "SALES",
      salesAgentId: AGENT
    },
    "unassigned"
  );
  assert.equal(r.ok, false);
});

test("MANAGER without owner uses tenant-wide filter", () => {
  const r = resolveLeadsListAssignmentFilter(
    {
      tenantId: "t",
      userId: "u",
      email: "m@x.com",
      role: "MANAGER",
      salesAgentId: AGENT
    },
    undefined
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.filter, { kind: "none" });
});
