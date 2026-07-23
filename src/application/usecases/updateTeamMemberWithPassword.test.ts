import test from "node:test";
import assert from "node:assert/strict";
import { UpdateTeamMemberWithPasswordUseCase } from "./updateTeamMemberWithPassword.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const SALES_ID = "11111111-1111-4111-8111-111111111111";
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
    activeConversationCount: 0,
    activeLeadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function adminAuth() {
  return {
    tenantId: TENANT_ID,
    userId: "adm-user",
    email: "adm@example.com",
    role: "ADMIN" as const,
    salesAgentId: ADM_ID
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findByIdInTenant: async () => baseMember(),
    findByEmailInTenant: async () => null,
    countActiveAdmins: async () => 2,
    update: async (input: { patch: Record<string, unknown> }) => baseMember(input.patch as any),
    ...overrides
  };
}

test("empty newPassword does not call Auth admin update", async () => {
  let authCalled = false;
  const uc = new UpdateTeamMemberWithPasswordUseCase({
    salesAgentRepository: makeRepo({
      update: async () => baseMember({ name: "Renamed" })
    }) as any,
    findAuthUserIdByEmail: async () => {
      authCalled = true;
      return "auth-1";
    },
    updateAuthUserPasswordById: async () => {
      authCalled = true;
    },
    recordPasswordAudit: () => {}
  });
  await uc.execute({
    auth: adminAuth(),
    salesAgentId: SALES_ID,
    patch: { name: "Renamed" }
  });
  assert.equal(authCalled, false);
});

test("Auth failure triggers member-data compensation", async () => {
  const updates: Record<string, unknown>[] = [];
  const uc = new UpdateTeamMemberWithPasswordUseCase({
    salesAgentRepository: makeRepo({
      update: async (input: { patch: Record<string, unknown> }) => {
        updates.push({ ...input.patch });
        return baseMember({ ...(input.patch as object) });
      }
    }) as any,
    findAuthUserIdByEmail: async () => "auth-1",
    updateAuthUserPasswordById: async () => {
      throw new Error("auth failed");
    },
    recordPasswordAudit: () => {}
  });
  await assert.rejects(
    () =>
      uc.execute({
        auth: adminAuth(),
        salesAgentId: SALES_ID,
        patch: { name: "Changed" },
        newPassword: "newpass1234"
      }),
    /Unable to update password/
  );
  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.name, "Changed");
  assert.equal(updates[1]?.name, "Sales");
});

test("compensation failure produces safe internal event without secrets", async () => {
  const auditEvents: unknown[] = [];
  let updateCalls = 0;
  const uc = new UpdateTeamMemberWithPasswordUseCase({
    salesAgentRepository: makeRepo({
      update: async (input: { patch: Record<string, unknown> }) => {
        updateCalls += 1;
        if (updateCalls === 1) return baseMember({ name: "Changed" });
        throw new Error("comp failed");
      }
    }) as any,
    findAuthUserIdByEmail: async () => "auth-1",
    updateAuthUserPasswordById: async () => {
      throw new Error("auth failed");
    },
    recordPasswordAudit: (e) => {
      auditEvents.push(e);
    }
  });
  await assert.rejects(
    () =>
      uc.execute({
        auth: adminAuth(),
        salesAgentId: SALES_ID,
        patch: { name: "Changed" },
        newPassword: "newpass1234"
      }),
    /Unable to update password/
  );
  assert.equal(auditEvents.length, 1);
  assert.equal(JSON.stringify(auditEvents).includes("newpass1234"), false);
});

test("non-Admin cannot update password via use case", async () => {
  const uc = new UpdateTeamMemberWithPasswordUseCase({
    salesAgentRepository: makeRepo() as any,
    findAuthUserIdByEmail: async () => "auth-1",
    updateAuthUserPasswordById: async () => {},
    recordPasswordAudit: () => {}
  });
  await assert.rejects(
    () =>
      uc.execute({
        auth: { ...adminAuth(), role: "MANAGER", salesAgentId: "mgr-1" },
        salesAgentId: SALES_ID,
        patch: {},
        newPassword: "newpass1234"
      }),
    /Forbidden update team member password/
  );
});

test("cross-tenant target rejected as not found", async () => {
  const uc = new UpdateTeamMemberWithPasswordUseCase({
    salesAgentRepository: makeRepo({
      findByIdInTenant: async () => null
    }) as any,
    findAuthUserIdByEmail: async () => "auth-1",
    updateAuthUserPasswordById: async () => {},
    recordPasswordAudit: () => {}
  });
  await assert.rejects(
    () =>
      uc.execute({
        auth: adminAuth(),
        salesAgentId: SALES_ID,
        patch: {},
        newPassword: "newpass1234"
      }),
    /Team member not found/
  );
});
