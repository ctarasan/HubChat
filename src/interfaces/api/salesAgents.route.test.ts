import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSalesAgentsGetHandler, createSalesAgentsPostHandler } from "../../../app/api/sales-agents/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function makeGetReq(search = ""): NextRequest {
  const url = search ? `http://local/api/sales-agents?${search}` : "http://local/api/sales-agents";
  return new NextRequest(url, {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function makePostReq(body: unknown): NextRequest {
  return new NextRequest("http://local/api/sales-agents", {
    method: "POST",
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });
}

const sampleAgents = [
  { id: "a1", email: "a1@t.com", name: "Alpha", role: "SALES", status: "ACTIVE" },
  { id: "a2", email: "b2@t.com", name: "Beta", role: "SALES", status: "ACTIVE" }
];

const fullRow = {
  id: "a1",
  tenantId: TENANT_ID,
  name: "Alpha",
  email: "a1@t.com",
  role: "SALES",
  status: "INACTIVE",
  assignmentEnabled: false,
  assignmentMode: "MANUAL_ONLY" as const,
  maxActiveConversations: null,
  maxActiveLeads: null,
  activeConversationCount: 0,
  activeLeadCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

test("GET /api/sales-agents default uses listActiveByTenant for MANAGER", async () => {
  let listActiveCalled = false;
  let listByTenantCalled = false;
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
          listActiveByTenant: async () => {
            listActiveCalled = true;
            return sampleAgents;
          },
          listByTenant: async () => {
            listByTenantCalled = true;
            return [fullRow];
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq());
  assert.equal(res.status, 200);
  assert.equal(listActiveCalled, true);
  assert.equal(listByTenantCalled, false);
  const body = JSON.parse(await res.text());
  assert.deepEqual(body.data, sampleAgents);
});

test("GET /api/sales-agents includeInactive=true uses listByTenant", async () => {
  let listByTenantCalled = false;
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
          listActiveByTenant: async () => sampleAgents,
          listByTenant: async (input: any) => {
            listByTenantCalled = true;
            assert.equal(input.tenantId, TENANT_ID);
            assert.equal(input.includeInactive, true);
            return [fullRow];
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq("includeInactive=true"));
  assert.equal(res.status, 200);
  assert.equal(listByTenantCalled, true);
  const body = JSON.parse(await res.text());
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, "a1");
});

test("GET /api/sales-agents invalid query returns 400", async () => {
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
          listActiveByTenant: async () => [],
          listByTenant: async () => []
        }
      }) as any
  });
  const res = await handler(makeGetReq("role=BOGUS"));
  assert.equal(res.status, 400);
});

test("GET /api/sales-agents returns 403 for SALES", async () => {
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(makeGetReq());
  assert.equal(res.status, 403);
});

test("GET /api/sales-agents returns 401 when unauthenticated", async () => {
  const handler = createSalesAgentsGetHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(makeGetReq());
  assert.equal(res.status, 401);
});

test("POST create SALES by MANAGER succeeds", async () => {
  const created = { ...fullRow, id: "new1", status: "ACTIVE" };
  const handler = createSalesAgentsPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "m1",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: "m1-agent"
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByEmailInTenant: async () => null,
          create: async () => created
        }
      }) as any
  });
  const res = await handler(
    makePostReq({ name: "New", email: "new@example.com", role: "SALES" })
  );
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.data.id, "new1");
});

test("POST create ADMIN by MANAGER forbidden", async () => {
  const handler = createSalesAgentsPostHandler({
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
          findByEmailInTenant: async () => null,
          create: async () => fullRow
        }
      }) as any
  });
  const res = await handler(makePostReq({ name: "Bad", email: "bad@example.com", role: "ADMIN" }));
  assert.equal(res.status, 403);
});

test("POST create ADMIN by ADMIN succeeds", async () => {
  const created = { ...fullRow, id: "adm2", role: "ADMIN" };
  const handler = createSalesAgentsPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "a1",
        email: "root@example.com",
        role: "ADMIN",
        salesAgentId: "adm-self"
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByEmailInTenant: async () => null,
          create: async () => created
        }
      }) as any
  });
  const res = await handler(
    makePostReq({ name: "Admin2", email: "admin2@example.com", role: "ADMIN" })
  );
  assert.equal(res.status, 200);
});

test("POST duplicate email rejected", async () => {
  const handler = createSalesAgentsPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "a1",
        email: "root@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByEmailInTenant: async () => ({ id: "existing" }),
          create: async () => fullRow
        }
      }) as any
  });
  const res = await handler(makePostReq({ name: "Dup", email: "dup@example.com", role: "SALES" }));
  assert.equal(res.status, 400);
});

test("POST invalid assignment mode rejected", async () => {
  const handler = createSalesAgentsPostHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "a1",
        email: "root@example.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(
    makePostReq({ name: "X", email: "x@example.com", role: "SALES", assignmentMode: "BOGUS" })
  );
  assert.equal(res.status, 400);
});
