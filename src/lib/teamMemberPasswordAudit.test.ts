import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTeamMemberPasswordAuditSafe,
  buildTeamMemberPasswordAuditEvent,
  emitTeamMemberPasswordAudit
} from "./teamMemberPasswordAudit.js";

test("audit event excludes password fields", () => {
  const event = buildTeamMemberPasswordAuditEvent({
    action: "TEAM_MEMBER_PASSWORD_UPDATED",
    actorUserId: "actor-1",
    targetMemberId: "target-1",
    tenantId: "tenant-1",
    success: true,
    errorCategory: null
  });
  assert.equal(JSON.stringify(event).includes("password"), false);
  assertTeamMemberPasswordAuditSafe(event);
});

test("audit rejects forbidden secret keys", () => {
  assert.throws(() => assertTeamMemberPasswordAuditSafe({ newPassword: "x" }), /must not include/);
});

test("emitTeamMemberPasswordAudit records success metadata only", () => {
  const seen: unknown[] = [];
  emitTeamMemberPasswordAudit((e) => seen.push(e), {
    action: "TEAM_MEMBER_PASSWORD_UPDATED",
    actorUserId: "actor-1",
    targetMemberId: "target-1",
    tenantId: "tenant-1",
    success: false,
    errorCategory: "AUTH_UPDATE_FAILED",
    timestamp: "2026-07-23T00:00:00.000Z"
  });
  assert.equal(seen.length, 1);
  assert.equal(JSON.stringify(seen).includes("AUTH_UPDATE_FAILED"), true);
});
