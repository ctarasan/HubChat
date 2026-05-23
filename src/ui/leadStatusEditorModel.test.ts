import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadStatusPatch,
  conversationLeadStatusPatchPath,
  getLeadManagementStatusLabel,
  listAllowedLeadManagementStatusTransitions,
  mapLeadStatusSaveError,
  mergeConversationLeadStatusFromPayload,
  resolveLeadManagementStatusFromRow
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
