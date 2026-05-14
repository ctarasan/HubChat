import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createSalesAgentPatchHandler } from "../../../app/api/sales-agents/[id]/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const SALES_ID = "11111111-1111-4111-8111-111111111111";
const MGR_ID = "22222222-2222-4222-8222-222222222222";
const ADM_ID = "33333333-3333-4333-8333-333333333333";

function baseMember(overrides: Record<string, unknown> = {}) {
  return {
    id: SALES_ID,
    tenantId: TENANT_ID,
    name: "Sales",
    email: "sales@example.com",
    role: "SALES",
    status: "ACTIVE",
    assignmentEnabled: false,
    assignmentMode: "MANUAL_ONLY" as const,
    maxActiveConversations: null,
    maxActiveLeads: null,
    activeConversationCount: 1,
    activeLeadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function makePatchReq(agentId: string, body: unknown): NextRequest {
  return new NextRequest(`http://local/api/sales-agents/${agentId}`, {
    method: "PATCH",
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body)
  });
}

test("PATCH MANAGER updates SALES succeeds", async () => {
  let updated = false;
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "mgr-user",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: MGR_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ name: "Sales" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 1,
          update: async () => {
            updated = true;
            return baseMember({ name: "Sales2" });
          }
        }
      }) as any
  });
  const res = await handler(makePatchReq(SALES_ID, { name: "Sales2" }), {
    params: Promise.resolve({ id: SALES_ID })
  });
  assert.equal(res.status, 200);
  assert.equal(updated, true);
});

test("PATCH MANAGER cannot update MANAGER", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "mgr-user",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: MGR_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () =>
            baseMember({ id: MGR_ID, role: "MANAGER", email: "mgr2@example.com" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 2,
          update: async () => baseMember()
        }
      }) as any
  });
  const res = await handler(makePatchReq(MGR_ID, { name: "Hack" }), {
    params: Promise.resolve({ id: MGR_ID })
  });
  assert.equal(res.status, 403);
});

test("PATCH ADMIN updates MANAGER succeeds", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm-user",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: ADM_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () =>
            baseMember({ id: MGR_ID, role: "MANAGER", email: "mgr2@example.com" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 2,
          update: async () => baseMember({ id: MGR_ID, role: "MANAGER", name: "Renamed" })
        }
      }) as any
  });
  const res = await handler(makePatchReq(MGR_ID, { name: "Renamed" }), {
    params: Promise.resolve({ id: MGR_ID })
  });
  assert.equal(res.status, 200);
});

test("PATCH self deactivation forbidden", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm-user",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: ADM_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ id: ADM_ID, role: "ADMIN", status: "ACTIVE" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 2,
          update: async () => baseMember()
        }
      }) as any
  });
  const res = await handler(makePatchReq(ADM_ID, { status: "INACTIVE" }), {
    params: Promise.resolve({ id: ADM_ID })
  });
  assert.equal(res.status, 403);
});

test("PATCH last active ADMIN deactivation forbidden", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "other",
        email: "other@example.com",
        role: "ADMIN",
        salesAgentId: "other-agent"
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ id: ADM_ID, role: "ADMIN", status: "ACTIVE" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 1,
          update: async () => baseMember()
        }
      }) as any
  });
  const res = await handler(makePatchReq(ADM_ID, { status: "INACTIVE" }), {
    params: Promise.resolve({ id: ADM_ID })
  });
  assert.equal(res.status, 403);
});

test("PATCH last active ADMIN role downgrade to MANAGER or SALES forbidden without update", async () => {
  for (const newRole of ["MANAGER", "SALES"] as const) {
    let updated = false;
    const handler = createSalesAgentPatchHandler({
      requireAuth: async () =>
        ({
          tenantId: TENANT_ID,
          userId: "other",
          email: "other@example.com",
          role: "ADMIN",
          salesAgentId: "other-agent"
        }) as any,
      apiBootstrap: () =>
        ({
          salesAgentRepository: {
            findByIdInTenant: async () =>
              baseMember({ id: ADM_ID, role: "ADMIN", status: "ACTIVE", email: "sole@example.com" }),
            findByEmailInTenant: async () => null,
            countActiveAdmins: async () => 1,
            update: async () => {
              updated = true;
              return baseMember();
            }
          }
        }) as any
    });
    const res = await handler(makePatchReq(ADM_ID, { role: newRole }), {
      params: Promise.resolve({ id: ADM_ID })
    });
    assert.equal(res.status, 403, `status for role ${newRole}`);
    const body = (await res.json()) as { error?: string };
    assert.match(String(body.error ?? ""), /last active ADMIN/i);
    assert.equal(updated, false, `update must not run for role ${newRole}`);
  }
});

test("PATCH invalid capacity rejected", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "mgr-user",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: MGR_ID
      }) as any,
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(makePatchReq(SALES_ID, { maxActiveConversations: -1 }), {
    params: Promise.resolve({ id: SALES_ID })
  });
  assert.equal(res.status, 400);
});

test("PATCH unknown member 404", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm-user",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: ADM_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => null,
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 0,
          update: async () => baseMember()
        }
      }) as any
  });
  const res = await handler(makePatchReq("99999999-9999-4999-8999-999999999999", { name: "X" }), {
    params: Promise.resolve({ id: "99999999-9999-4999-8999-999999999999" })
  });
  assert.equal(res.status, 404);
});

test("PATCH MANAGER cannot promote SALES to MANAGER", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "mgr-user",
        email: "mgr@example.com",
        role: "MANAGER",
        salesAgentId: MGR_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ role: "SALES" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 2,
          update: async () => baseMember({ role: "MANAGER" })
        }
      }) as any
  });
  const res = await handler(makePatchReq(SALES_ID, { role: "MANAGER" }), {
    params: Promise.resolve({ id: SALES_ID })
  });
  assert.equal(res.status, 403);
});

test("PATCH lowercases email in API response after email change", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm-user",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: ADM_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ email: "sales@example.com" }),
          findByEmailInTenant: async () => null,
          countActiveAdmins: async () => 1,
          update: async (input: { patch: { email?: string } }) => {
            const e = input.patch?.email;
            const normalized = typeof e === "string" ? e.trim().toLowerCase() : "sales@example.com";
            return baseMember({ email: normalized });
          }
        }
      }) as any
  });
  const res = await handler(makePatchReq(SALES_ID, { email: "NEWUSER@EXAMPLE.COM" }), {
    params: Promise.resolve({ id: SALES_ID })
  });
  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.data.email, "newuser@example.com");
});

test("PATCH duplicate email rejected case-insensitively", async () => {
  const handler = createSalesAgentPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "adm-user",
        email: "adm@example.com",
        role: "ADMIN",
        salesAgentId: ADM_ID
      }) as any,
    apiBootstrap: () =>
      ({
        salesAgentRepository: {
          findByIdInTenant: async () => baseMember({ email: "sales@example.com" }),
          findByEmailInTenant: async (_t: string, em: string) => (em === "mgr2@example.com" ? { id: MGR_ID } : null),
          countActiveAdmins: async () => 2,
          update: async () => baseMember()
        }
      }) as any
  });
  const res = await handler(makePatchReq(SALES_ID, { email: "MGR2@EXAMPLE.COM" }), {
    params: Promise.resolve({ id: SALES_ID })
  });
  assert.equal(res.status, 400);
});
