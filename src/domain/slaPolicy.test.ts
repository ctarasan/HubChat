import test from "node:test";
import assert from "node:assert/strict";
import { computeSlaDueAtFromCustomerMessage } from "./slaPolicy.js";
import { buildDefaultTenantSlaPolicy } from "./tenantSlaPolicy.js";

test("computeSlaDueAtFromCustomerMessage adds SLA window from explicit slaMs", () => {
  const at = new Date("2026-05-15T10:00:00.000Z");
  const minutes = buildDefaultTenantSlaPolicy().rules.NEW_FIRST_RESPONSE.targetMinutes!;
  const due = computeSlaDueAtFromCustomerMessage(at, { slaMs: minutes * 60_000 });
  assert.ok(due);
  assert.equal(due!.getTime() - at.getTime(), minutes * 60_000);
});

test("computeSlaDueAtFromCustomerMessage returns null for invalid date", () => {
  assert.equal(
    computeSlaDueAtFromCustomerMessage(new Date("invalid"), { slaMs: 60_000 }),
    null
  );
});

test("computeSlaDueAtFromCustomerMessage returns null for non-positive slaMs", () => {
  assert.equal(
    computeSlaDueAtFromCustomerMessage(new Date("2026-05-15T10:00:00.000Z"), { slaMs: 0 }),
    null
  );
});
