import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanDeactivateOrDemoteAdmin,
  canCreateTeamMemberRole,
  canUpdateTeamMemberRole,
  canManagerUpdateExistingTarget
} from "./teamMemberPermissions.js";

test("canCreateTeamMemberRole MANAGER only SALES", () => {
  assert.equal(canCreateTeamMemberRole("MANAGER", "SALES"), true);
  assert.equal(canCreateTeamMemberRole("MANAGER", "MANAGER"), false);
  assert.equal(canCreateTeamMemberRole("MANAGER", "ADMIN"), false);
  assert.equal(canCreateTeamMemberRole("ADMIN", "ADMIN"), true);
});

test("canManagerUpdateExistingTarget only SALES", () => {
  assert.equal(canManagerUpdateExistingTarget("SALES"), true);
  assert.equal(canManagerUpdateExistingTarget("MANAGER"), false);
});

test("canUpdateTeamMemberRole MANAGER cannot promote", () => {
  assert.equal(canUpdateTeamMemberRole("MANAGER", "SALES", undefined), true);
  assert.equal(canUpdateTeamMemberRole("MANAGER", "SALES", "SALES"), true);
  assert.equal(canUpdateTeamMemberRole("MANAGER", "SALES", "MANAGER"), false);
  assert.equal(canUpdateTeamMemberRole("ADMIN", "SALES", "MANAGER"), true);
});

test("assertCanDeactivateOrDemoteAdmin self inactive forbidden", () => {
  assert.throws(
    () =>
      assertCanDeactivateOrDemoteAdmin({
        actorSalesAgentId: "u1",
        targetId: "u1",
        targetRole: "SALES",
        targetStatus: "ACTIVE",
        patchStatus: "INACTIVE",
        patchRole: undefined,
        activeAdminCount: 0
      }),
    /Cannot deactivate yourself/
  );
});

test("assertCanDeactivateOrDemoteAdmin last admin forbidden", () => {
  assert.throws(
    () =>
      assertCanDeactivateOrDemoteAdmin({
        actorSalesAgentId: "other",
        targetId: "adm1",
        targetRole: "ADMIN",
        targetStatus: "ACTIVE",
        patchStatus: "INACTIVE",
        patchRole: undefined,
        activeAdminCount: 1
      }),
    /last active ADMIN/
  );
});

test("assertCanDeactivateOrDemoteAdmin two admins one inactive ok", () => {
  assert.doesNotThrow(() =>
    assertCanDeactivateOrDemoteAdmin({
      actorSalesAgentId: "other",
      targetId: "adm1",
      targetRole: "ADMIN",
      targetStatus: "ACTIVE",
      patchStatus: "INACTIVE",
      patchRole: undefined,
      activeAdminCount: 2
    })
  );
});
