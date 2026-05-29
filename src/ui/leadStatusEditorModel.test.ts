import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadStatusPatch,
  buildQualifiedLeadStatusPatch,
  canShowMarkQualifiedLeadAction,
  conversationLeadStatusPatchPath,
  getConversationLeadDisplayLabel,
  getLeadFunnelStatusLabel,
  getLeadManagementStatusLabel,
  isLeadFunnelQualified,
  listAllowedLeadManagementStatusTransitions,
  mapLeadStatusSaveError,
  mergeConversationLeadStatusFromPayload,
  resolveLeadManagementStatusFromRow,
  resolveRawLeadStatusFromRow
} from "./leadStatusEditorModel.js";

test("getLeadManagementStatusLabel maps management codes to friendly labels", () => {
  assert.equal(getLeadManagementStatusLabel("NEW"), "New");
  assert.equal(getLeadManagementStatusLabel("IN_PROGRESS"), "In progress");
  assert.equal(getLeadManagementStatusLabel("FOLLOW_UP"), "Follow up");
  assert.equal(getLeadManagementStatusLabel("WON"), "Won");
  assert.equal(getLeadManagementStatusLabel("LOST"), "Lost");
  assert.equal(getLeadManagementStatusLabel("CLOSED"), "Closed");
});

test("resolveLeadManagementStatusFromRow prefers lead_management_status", () => {
  assert.equal(
    resolveLeadManagementStatusFromRow({ lead_management_status: "WON", lead_status: "CONTACTED" }),
    "WON"
  );
});

test("resolveLeadManagementStatusFromRow derives FOLLOW_UP from follow_up_at", () => {
  assert.equal(
    resolveLeadManagementStatusFromRow({
      lead_status: "CONTACTED",
      follow_up_at: "2026-05-16T09:00:00.000Z"
    }),
    "FOLLOW_UP"
  );
});

test("buildLeadStatusPatch matches conversation lead-status API body", () => {
  assert.deepEqual(buildLeadStatusPatch("IN_PROGRESS"), { leadStatus: "IN_PROGRESS" });
});

test("conversationLeadStatusPatchPath encodes id", () => {
  assert.equal(conversationLeadStatusPatchPath("abc/def"), "/api/conversations/abc%2Fdef/lead-status");
});

test("listAllowedLeadManagementStatusTransitions blocks terminal reopening", () => {
  assert.deepEqual(listAllowedLeadManagementStatusTransitions("WON"), []);
  assert.ok(listAllowedLeadManagementStatusTransitions("NEW").includes("WON"));
});

test("mergeConversationLeadStatusFromPayload updates management, db status, and clears follow-up", () => {
  const row = {
    id: "c1",
    lead_management_status: "FOLLOW_UP",
    lead_status: "CONTACTED",
    follow_up_at: "2026-05-16T09:00:00.000Z",
    follow_up_note: "Call"
  };
  const merged = mergeConversationLeadStatusFromPayload(row, {
    leadStatus: "WON",
    lead_status: "WON",
    followUpAt: null,
    followUpNote: "Call"
  }) as Record<string, unknown>;
  assert.equal(merged.lead_management_status, "WON");
  assert.equal(merged.lead_status, "WON");
  assert.equal(merged.follow_up_at, null);
  assert.equal(merged.follow_up_note, "Call");
});

test("mapLeadStatusSaveError returns safe permission and not-found messages", () => {
  assert.match(mapLeadStatusSaveError("Forbidden"), /permission/i);
  assert.equal(mapLeadStatusSaveError("Conversation not found"), "Conversation not found.");
  assert.equal(mapLeadStatusSaveError(""), "Failed to update lead status.");
});

test("buildQualifiedLeadStatusPatch uses QUALIFIED lead-status contract", () => {
  assert.deepEqual(buildQualifiedLeadStatusPatch(), { leadStatus: "QUALIFIED" });
});

test("getLeadFunnelStatusLabel and display label surface Qualified funnel stage", () => {
  assert.equal(getLeadFunnelStatusLabel("QUALIFIED"), "Qualified");
  assert.equal(
    getConversationLeadDisplayLabel({ lead_status: "QUALIFIED", lead_management_status: "IN_PROGRESS" }),
    "Qualified"
  );
});

test("isLeadFunnelQualified detects persisted QUALIFIED status", () => {
  assert.equal(isLeadFunnelQualified({ lead_status: "QUALIFIED" }), true);
  assert.equal(isLeadFunnelQualified({ lead_status: "CONTACTED" }), false);
});

test("canShowMarkQualifiedLeadAction respects permission and funnel transitions", () => {
  const contacted = { lead_status: "CONTACTED" as const };
  assert.equal(
    canShowMarkQualifiedLeadAction({ canUpdateLeadStatus: true, row: contacted }),
    true
  );
  assert.equal(
    canShowMarkQualifiedLeadAction({ canUpdateLeadStatus: false, row: contacted }),
    false
  );
  assert.equal(
    canShowMarkQualifiedLeadAction({ canUpdateLeadStatus: true, row: { lead_status: "QUALIFIED" } }),
    false
  );
  assert.equal(
    canShowMarkQualifiedLeadAction({ canUpdateLeadStatus: true, row: { lead_status: "NEW" } }),
    false
  );
});

test("mergeConversationLeadStatusFromPayload keeps QUALIFIED db status from API response", () => {
  const merged = mergeConversationLeadStatusFromPayload(
    { id: "c1", lead_status: "CONTACTED" },
    { leadStatus: "IN_PROGRESS", lead_status: "QUALIFIED" }
  ) as Record<string, unknown>;
  assert.equal(merged.lead_status, "QUALIFIED");
  assert.equal(resolveRawLeadStatusFromRow(merged as { lead_status?: string }), "QUALIFIED");
});
