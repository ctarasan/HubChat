import test from "node:test";
import assert from "node:assert/strict";
import { CreateTeamMemberUseCase } from "./createTeamMember.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

test("CreateTeamMember rejects duplicate when only casing differs from existing row", async () => {
  const repo = {
    findByEmailInTenant: async (_t: string, em: string) => (em === "sm001@b-connex.net" ? { id: "other" } : null),
    create: async () => {
      throw new Error("should not create");
    }
  };
  const uc = new CreateTeamMemberUseCase({ salesAgentRepository: repo as any });
  await assert.rejects(
    () =>
      uc.execute({
        auth: { tenantId: TENANT, userId: "a", email: "adm@x.com", role: "ADMIN", salesAgentId: null } as any,
        body: {
          name: "N",
          email: "SM001@B-CONNEX.NET",
          role: "SALES"
        }
      }),
    /Duplicate team member email/
  );
});
