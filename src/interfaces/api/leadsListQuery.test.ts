import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadsListInboxFilters, parseLeadsListQuery } from "./leadsListQuery.js";

test("parseLeadsListQuery accepts QUALIFIED status and filters", () => {
  const parsed = parseLeadsListQuery({
    status: "QUALIFIED",
    channel: "INSTAGRAM",
    owner: "me",
    followUp: "overdue",
    sla: "overdue",
    search: "ลูกค้า"
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.status, "QUALIFIED");
  assert.equal(parsed.value.channel, "INSTAGRAM");
  assert.equal(parsed.value.owner, "me");
});

test("parseLeadsListQuery rejects unknown keys", () => {
  const parsed = parseLeadsListQuery({ status: "NEW", extra: "x" } as Record<string, string>);
  assert.equal(parsed.ok, false);
});

test("parseLeadsListQuery rejects invalid status", () => {
  const parsed = parseLeadsListQuery({ status: "INVALID" });
  assert.equal(parsed.ok, false);
});

test("buildLeadsListInboxFilters maps follow-up and sla", () => {
  assert.deepEqual(buildLeadsListInboxFilters({ followUp: "overdue", sla: "overdue" }), {
    followUp: "overdue",
    sla: "overdue"
  });
});
