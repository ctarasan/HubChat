import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidLeadManagementStatusTransition,
  isTerminalLeadManagementStatus,
  leadStatusToManagementStatus,
  resolveLeadStatusForManagementUpdate
} from "./leadManagementStatus.js";

test("leadStatusToManagementStatus maps funnel and follow-up", () => {
  assert.equal(leadStatusToManagementStatus("NEW", null), "NEW");
  assert.equal(leadStatusToManagementStatus("CONTACTED", null), "IN_PROGRESS");
  assert.equal(leadStatusToManagementStatus("NEGOTIATION", null), "IN_PROGRESS");
  assert.equal(
    leadStatusToManagementStatus("CONTACTED", new Date("2026-05-20T00:00:00.000Z")),
    "FOLLOW_UP"
  );
  assert.equal(leadStatusToManagementStatus("WON", null), "WON");
  assert.equal(leadStatusToManagementStatus("LOST", null), "LOST");
  assert.equal(leadStatusToManagementStatus("UNQUALIFIED", null), "CLOSED");
});

test("resolveLeadStatusForManagementUpdate preserves funnel depth", () => {
  assert.equal(resolveLeadStatusForManagementUpdate("QUALIFIED", "IN_PROGRESS"), "QUALIFIED");
  assert.equal(resolveLeadStatusForManagementUpdate("NEW", "IN_PROGRESS"), "CONTACTED");
  assert.equal(resolveLeadStatusForManagementUpdate("NEGOTIATION", "CLOSED"), "UNQUALIFIED");
});

test("assertValidLeadManagementStatusTransition blocks terminal reopen", () => {
  assert.throws(() => assertValidLeadManagementStatusTransition("WON", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertValidLeadManagementStatusTransition("IN_PROGRESS", "WON"));
});

test("isTerminalLeadManagementStatus", () => {
  assert.equal(isTerminalLeadManagementStatus("WON"), true);
  assert.equal(isTerminalLeadManagementStatus("NEW"), false);
});
