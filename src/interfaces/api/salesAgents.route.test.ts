import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSalesAgentsGetHandler } from "../../../app/api/sales-agents/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeReq(): NextRequest {
  return new NextRequest("http://local/api/sales-agents", {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

const sampleAgents = [
  { id: "a1", email: "a1@t.com", name: "Alpha", role: "SALES", status: "ACTIVE" },
  { id: "a2", email: "b2@t.com", name: "Beta", role: "SALES", status: "ACTIVE" }
];

test("GET /api/sales-agents returns list for MANAGER", async () => {
  let listedTenant = "";
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "m1",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          listActiveByTenant: async (tid: string) => {
            listedTenant = tid;
            return sampleAgents;
          }
        }
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  assert.equal(listedTenant, TENANT_ID);
  const body = JSON.parse(await res.text());
  assert.deepEqual(body.data, sampleAgents);
});

test("GET /api/sales-agents returns list for ADMIN", async () => {
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          listActiveByTenant: async () => []
        }
      }) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
});

test("GET /api/sales-agents returns 403 for SALES", async () => {
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 403);
});

test("GET /api/sales-agents returns 401 when unauthenticated", async () => {
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 401);
});
