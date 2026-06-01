import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkflowItemsQuery, parseWorkflowLimit } from "./workflowContracts.js";

test("parseWorkflowLimit caps at 50", () => {
  assert.equal(parseWorkflowLimit("100"), 50);
  assert.equal(parseWorkflowLimit(undefined), 25);
});

test("parseWorkflowItemsQuery requires kind=follow_up", () => {
  const bad = parseWorkflowItemsQuery({});
  assert.equal(bad.ok, false);
  const ok = parseWorkflowItemsQuery({ kind: "follow_up", limit: "10" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.limit, 10);
});
