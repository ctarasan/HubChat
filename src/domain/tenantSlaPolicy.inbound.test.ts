import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultTenantSlaPolicy,
  computeSlaDueAtFromPolicy,
  resolveInboundSlaRule,
  type TenantSlaPolicy
} from "./tenantSlaPolicy.js";

function policyWith(overrides: Partial<TenantSlaPolicy>): TenantSlaPolicy {
  const base = buildDefaultTenantSlaPolicy();
  return {
    ...base,
    ...overrides,
    rules: overrides.rules ?? base.rules
  };
}

function ruleTargetMinutes(policy: TenantSlaPolicy, key: keyof TenantSlaPolicy["rules"]): number {
  const minutes = policy.rules[key].targetMinutes;
  assert.ok(minutes !== null);
  return minutes;
}

test("resolveInboundSlaRule returns null when global policy disabled", () => {
  const policy = policyWith({ enabled: false });
  assert.equal(
    resolveInboundSlaRule({
      policy,
      conversationStatus: "OPEN",
      firstResponseAt: null,
      reopenFromResolved: false
    }),
    null
  );
});

test("resolveInboundSlaRule skips ARCHIVED when excludeArchived is true", () => {
  const policy = policyWith({ excludeArchived: true });
  assert.equal(
    resolveInboundSlaRule({
      policy,
      conversationStatus: "ARCHIVED",
      firstResponseAt: null,
      reopenFromResolved: false
    }),
    null
  );
});

test("resolveInboundSlaRule skips RESOLVED when excludeResolved and not reopening", () => {
  const policy = policyWith({ excludeResolved: true });
  assert.equal(
    resolveInboundSlaRule({
      policy,
      conversationStatus: "RESOLVED",
      firstResponseAt: new Date("2026-05-01T00:00:00.000Z"),
      reopenFromResolved: false
    }),
    null
  );
});

test("resolveInboundSlaRule uses REOPENED_RESPONSE when reopening from RESOLVED", () => {
  const policy = buildDefaultTenantSlaPolicy();
  const resolved = resolveInboundSlaRule({
    policy,
    conversationStatus: "RESOLVED",
    firstResponseAt: new Date("2026-05-01T00:00:00.000Z"),
    reopenFromResolved: true
  });
  assert.equal(resolved?.ruleKey, "REOPENED_RESPONSE");
});

test("resolveInboundSlaRule uses NEW_FIRST_RESPONSE when first_response_at is absent", () => {
  const policy = buildDefaultTenantSlaPolicy();
  const resolved = resolveInboundSlaRule({
    policy,
    conversationStatus: "OPEN",
    firstResponseAt: null,
    reopenFromResolved: false
  });
  assert.equal(resolved?.ruleKey, "NEW_FIRST_RESPONSE");
});

test("resolveInboundSlaRule uses ONGOING_INBOUND_RESPONSE when first_response_at exists", () => {
  const policy = buildDefaultTenantSlaPolicy();
  const resolved = resolveInboundSlaRule({
    policy,
    conversationStatus: "OPEN",
    firstResponseAt: new Date("2026-05-01T00:00:00.000Z"),
    reopenFromResolved: false
  });
  assert.equal(resolved?.ruleKey, "ONGOING_INBOUND_RESPONSE");
});

test("resolveInboundSlaRule returns null when selected rule is disabled", () => {
  const base = buildDefaultTenantSlaPolicy();
  const policy = policyWith({
    rules: {
      ...base.rules,
      NEW_FIRST_RESPONSE: {
        ...base.rules.NEW_FIRST_RESPONSE,
        enabled: false,
        targetMinutes: null
      }
    }
  });
  assert.equal(
    resolveInboundSlaRule({
      policy,
      conversationStatus: "OPEN",
      firstResponseAt: null,
      reopenFromResolved: false
    }),
    null
  );
});

test("computeSlaDueAtFromPolicy uses enabled rule targetMinutes", () => {
  const base = buildDefaultTenantSlaPolicy();
  const customMinutes = 90;
  const policy = policyWith({
    rules: {
      ...base.rules,
      NEW_FIRST_RESPONSE: {
        ...base.rules.NEW_FIRST_RESPONSE,
        enabled: true,
        targetMinutes: customMinutes
      }
    }
  });
  const at = new Date("2026-05-15T10:00:00.000Z");
  const due = computeSlaDueAtFromPolicy(at, {
    policy,
    conversationStatus: "OPEN",
    firstResponseAt: null,
    reopenFromResolved: false
  });
  assert.ok(due);
  assert.equal(due!.getTime() - at.getTime(), customMinutes * 60_000);
});

test("computeSlaDueAtFromPolicy matches default factory NEW_FIRST_RESPONSE window", () => {
  const policy = buildDefaultTenantSlaPolicy();
  const at = new Date("2026-05-15T10:00:00.000Z");
  const due = computeSlaDueAtFromPolicy(at, {
    policy,
    conversationStatus: "OPEN",
    firstResponseAt: null,
    reopenFromResolved: false
  });
  assert.ok(due);
  assert.equal(
    due!.getTime() - at.getTime(),
    ruleTargetMinutes(policy, "NEW_FIRST_RESPONSE") * 60_000
  );
});
