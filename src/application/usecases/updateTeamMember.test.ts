import test from "node:test";
import assert from "node:assert/strict";
import { UpdateTeamMemberUseCase } from "./updateTeamMember.js";
import type { TeamMemberRow } from "../../domain/ports.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const SALES_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<TeamMemberRow> = {}): TeamMemberRow {
  return {
    id: SALES_ID,
    tenantId: TENANT,
    name: "S",
    email: "SM001@b-connex.net",
    role: "SALES",
    status: "ACTIVE",
    assignmentEnabled: false,
    assignmentMode: "MANUAL_ONLY",
    maxActiveConversations: null,
    maxActiveLeads: null,
    activeConversationCount: 0,
    activeLeadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over
  };
}

test("UpdateTeamMember rejects duplicate email case-insensitively", async () => {
  const repo = {
    findByIdInTenant: async () => row({ id: SALES_ID, email: "sales@b-connex.net" }),
    findByEmailInTenant: async () => ({ id: OTHER_ID }),
    countActiveAdmins: async () => 1,
    update: async () => row()
  };
  const uc = new UpdateTeamMemberUseCase({ salesAgentRepository: repo as any });
  await assert.rejects(
    () =>
      uc.execute({
        auth: { tenantId: TENANT, userId: "a", email: "adm@x.com", role: "ADMIN", salesAgentId: null } as any,
        salesAgentId: SALES_ID,
        patch: { email: "SM001@B-CONNEX.NET" }
      }),
    /Duplicate team member email/
  );
});

test("UpdateTeamMember skips duplicate check when only email casing changes for same row", async () => {
  let findEmailCalls = 0;
  const repo = {
    findByIdInTenant: async () => row({ email: "SM001@b-connex.net" }),
    findByEmailInTenant: async () => {
      findEmailCalls += 1;
      return { id: SALES_ID };
    },
    countActiveAdmins: async () => 1,
    update: async () => row({ email: "sm001@b-connex.net" })
  };
  const uc = new UpdateTeamMemberUseCase({ salesAgentRepository: repo as any });
  await uc.execute({
    auth: { tenantId: TENANT, userId: "a", email: "adm@x.com", role: "ADMIN", salesAgentId: null } as any,
    salesAgentId: SALES_ID,
    patch: { email: "sm001@b-connex.net" }
  });
  assert.equal(findEmailCalls, 0);
});
