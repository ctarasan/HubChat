import test from "node:test";
import assert from "node:assert/strict";
import { parseLimit, parseMessageLimit, PaginationConfig } from "./pagination.js";

test("parseLimit defaults to 25 and caps at 100", () => {
  assert.equal(parseLimit(undefined), PaginationConfig.DEFAULT_LIMIT);
  assert.equal(parseLimit("999"), 100);
  assert.equal(parseLimit("10"), 10);
});

test("parseMessageLimit defaults to 30 and caps at 100", () => {
  assert.equal(parseMessageLimit(undefined), PaginationConfig.MESSAGE_DEFAULT_LIMIT);
  assert.equal(parseMessageLimit("999"), 100);
  assert.equal(parseMessageLimit("15"), 15);
});
