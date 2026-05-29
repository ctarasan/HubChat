import test from "node:test";
import assert from "node:assert/strict";
import { parseLeadsListLimit } from "./leadsListPagination.js";

test("parseLeadsListLimit defaults to 25", () => {
  assert.equal(parseLeadsListLimit(), 25);
});

test("parseLeadsListLimit caps at 50", () => {
  assert.equal(parseLeadsListLimit("100"), 50);
});
