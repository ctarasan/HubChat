import test from "node:test";
import assert from "node:assert/strict";
import { computeSlaDueAtFromCustomerMessage, DEFAULT_FIRST_RESPONSE_SLA_MS } from "./slaPolicy.js";

test("computeSlaDueAtFromCustomerMessage adds default SLA window", () => {
  const at = new Date("2026-05-15T10:00:00.000Z");
  const due = computeSlaDueAtFromCustomerMessage(at);
  assert.ok(due);
  assert.equal(due!.getTime() - at.getTime(), DEFAULT_FIRST_RESPONSE_SLA_MS);
});

test("computeSlaDueAtFromCustomerMessage returns null for invalid date", () => {
  assert.equal(computeSlaDueAtFromCustomerMessage(new Date("invalid")), null);
});
