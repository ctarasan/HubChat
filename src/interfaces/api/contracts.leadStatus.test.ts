import test from "node:test";
import assert from "node:assert/strict";
import { LeadQuerySchema, PatchConversationLeadStatusSchema, PatchLeadSchema } from "./contracts.js";

test("PatchLeadSchema accepts UNQUALIFIED", () => {
  const r = PatchLeadSchema.safeParse({ status: "UNQUALIFIED" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.status, "UNQUALIFIED");
});

test("LeadQuerySchema status filter accepts UNQUALIFIED", () => {
  const r = LeadQuerySchema.safeParse({ status: "UNQUALIFIED" });
  assert.equal(r.success, true);
});

test("PatchLeadSchema rejects bogus status", () => {
  const r = PatchLeadSchema.safeParse({ status: "NOT_A_STATUS" });
  assert.equal(r.success, false);
});

test("PatchConversationLeadStatusSchema accepts QUALIFIED", () => {
  const r = PatchConversationLeadStatusSchema.safeParse({ leadStatus: "QUALIFIED" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.leadStatus, "QUALIFIED");
});

test("PatchConversationLeadStatusSchema keeps management statuses", () => {
  const r = PatchConversationLeadStatusSchema.safeParse({ leadStatus: "IN_PROGRESS" });
  assert.equal(r.success, true);
});
