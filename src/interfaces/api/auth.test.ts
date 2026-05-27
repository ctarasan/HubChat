import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createRequireAuth, resolveAuthFromSalesAgentRow } from "./auth.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

function makeAuthReq(): NextRequest {
  return new NextRequest("http://local/api/me", {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

test("resolveAuthFromSalesAgentRow accepts ACTIVE agent with allowed role", () => {
  const out = resolveAuthFromSalesAgentRow(
    { id: AGENT_ID, role: "MANAGER", status: "ACTIVE" },
    ["SALES", "MANAGER", "ADMIN"]
  );
  assert.equal(out.role, "MANAGER");
  assert.equal(out.salesAgentId, AGENT_ID);
});

test("resolveAuthFromSalesAgentRow rejects missing sales_agents row", () => {
  assert.throws(
    () => resolveAuthFromSalesAgentRow(null, ["ADMIN"]),
    (err: Error) => err.message === "Forbidden: no active sales agent profile"
  );
});

test("resolveAuthFromSalesAgentRow rejects inactive sales_agents row", () => {
  assert.throws(
    () => resolveAuthFromSalesAgentRow({ id: AGENT_ID, role: "ADMIN", status: "INACTIVE" }, ["ADMIN"]),
    (err: Error) => err.message === "Forbidden: inactive profile"
  );
});

test("resolveAuthFromSalesAgentRow rejects role not in allowedRoles", () => {
  assert.throws(
    () => resolveAuthFromSalesAgentRow({ id: AGENT_ID, role: "SALES", status: "ACTIVE" }, ["ADMIN"]),
    (err: Error) => err.message === "Forbidden"
  );
});

test("requireAuth rejects missing sales_agents row even when JWT metadata would be ADMIN", async () => {
  const requireAuth = createRequireAuth({
    getAuthUser: async () => ({
      id: "user-1",
      email: "admin@example.com"
    }),
    lookupSalesAgent: async () => null
  });

  await assert.rejects(
    () => requireAuth(makeAuthReq(), ["ADMIN"]),
    (err: Error) => err.message === "Forbidden: no active sales agent profile"
  );
});

test("requireAuth rejects inactive sales_agents row", async () => {
  const requireAuth = createRequireAuth({
    getAuthUser: async () => ({
      id: "user-1",
      email: "sales@example.com"
    }),
    lookupSalesAgent: async () => ({
      id: AGENT_ID,
      role: "SALES",
      status: "INACTIVE"
    })
  });

  await assert.rejects(
    () => requireAuth(makeAuthReq(), ["SALES"]),
    (err: Error) => err.message === "Forbidden: inactive profile"
  );
});

test("requireAuth succeeds for ACTIVE sales_agents row", async () => {
  const requireAuth = createRequireAuth({
    getAuthUser: async () => ({
      id: "user-1",
      email: "sales@example.com"
    }),
    lookupSalesAgent: async () => ({
      id: AGENT_ID,
      role: "SALES",
      status: "ACTIVE"
    })
  });

  const auth = await requireAuth(makeAuthReq(), ["SALES", "MANAGER"]);
  assert.equal(auth.role, "SALES");
  assert.equal(auth.salesAgentId, AGENT_ID);
  assert.equal(auth.tenantId, TENANT_ID);
});

test("requireAuth maps lookup infrastructure failure to SalesAgentLookupFailed", async () => {
  const requireAuth = createRequireAuth({
    getAuthUser: async () => ({
      id: "user-1",
      email: "sales@example.com"
    }),
    lookupSalesAgent: async () => {
      throw new Error("db down");
    }
  });

  await assert.rejects(
    () => requireAuth(makeAuthReq(), ["SALES"]),
    (err: Error) => err.message === "SalesAgentLookupFailed"
  );
});
