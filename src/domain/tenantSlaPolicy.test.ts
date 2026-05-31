import test from "node:test";
import assert from "node:assert/strict";
import {
  SLA_POLICY_RULE_KEYS,
  buildDefaultTenantSlaPolicy,
  rejectDeferredSlaPolicyFields,
  validateTenantSlaPolicy
} from "./tenantSlaPolicy.js";

test("buildDefaultTenantSlaPolicy includes all 5 fixed rule keys", () => {
  const policy = buildDefaultTenantSlaPolicy();
  assert.deepEqual(Object.keys(policy.rules).sort(), [...SLA_POLICY_RULE_KEYS].sort());
  assert.equal(policy.version, 0);
  assert.equal(policy.enabled, true);
});

test("validateTenantSlaPolicy rejects unknown rule keys", () => {
  const base = buildDefaultTenantSlaPolicy();
  assert.throws(
    () =>
      validateTenantSlaPolicy({
        ...base,
        rules: {
          ...base.rules,
          UNKNOWN_STAGE: base.rules.NEW_FIRST_RESPONSE
        } as typeof base.rules
      }),
    /Unknown SLA policy rule keys/
  );
});

test("validateTenantSlaPolicy rejects missing rule keys", () => {
  const base = buildDefaultTenantSlaPolicy();
  const { REOPENED_RESPONSE: _removed, ...partial } = base.rules;
  assert.throws(
    () =>
      validateTenantSlaPolicy({
        ...base,
        rules: partial as typeof base.rules
      }),
    /Missing SLA policy rule keys/
  );
});

test("validateTenantSlaPolicy rejects enabled rule without targetMinutes", () => {
  const base = buildDefaultTenantSlaPolicy();
  assert.throws(
    () =>
      validateTenantSlaPolicy({
        ...base,
        rules: {
          ...base.rules,
          NEW_FIRST_RESPONSE: {
            ...base.rules.NEW_FIRST_RESPONSE,
            enabled: true,
            targetMinutes: null
          }
        }
      }),
    /targetMinutes is required when enabled/
  );
});

test("validateTenantSlaPolicy rejects warning >= targetMinutes", () => {
  const base = buildDefaultTenantSlaPolicy();
  assert.throws(
    () =>
      validateTenantSlaPolicy({
        ...base,
        rules: {
          ...base.rules,
          NEW_FIRST_RESPONSE: {
            ...base.rules.NEW_FIRST_RESPONSE,
            enabled: true,
            targetMinutes: 60,
            warningBeforeBreachMinutes: 60
          }
        }
      }),
    /warningBeforeBreachMinutes must be less than targetMinutes/
  );
});

test("validateTenantSlaPolicy rejects deferred top-level fields via helper", () => {
  assert.throws(() => rejectDeferredSlaPolicyFields({ businessHours: {} }), /businessHours/);
  assert.throws(() => rejectDeferredSlaPolicyFields({ channelOverrides: {} }), /channelOverrides/);
  assert.throws(() => rejectDeferredSlaPolicyFields({ auditHistory: [] }), /auditHistory/);
});

test("validateTenantSlaPolicy accepts disabled rule with null targetMinutes", () => {
  const base = buildDefaultTenantSlaPolicy();
  const validated = validateTenantSlaPolicy({
    ...base,
    rules: {
      ...base.rules,
      QUALIFIED_FOLLOW_UP: {
        ...base.rules.QUALIFIED_FOLLOW_UP,
        enabled: false,
        targetMinutes: null
      }
    }
  });
  assert.equal(validated.rules.QUALIFIED_FOLLOW_UP.targetMinutes, null);
});

test("default policy inbound rules are enabled with target minutes", () => {
  const policy = buildDefaultTenantSlaPolicy();
  for (const key of ["NEW_FIRST_RESPONSE", "ONGOING_INBOUND_RESPONSE", "REOPENED_RESPONSE"] as const) {
    assert.equal(policy.rules[key].enabled, true);
    assert.ok(typeof policy.rules[key].targetMinutes === "number" && policy.rules[key].targetMinutes! > 0);
  }
});

test("default policy warning uses centralized factory value", () => {
  const policy = buildDefaultTenantSlaPolicy();
  assert.ok(policy.warningBeforeBreachMinutes > 0);
  assert.equal(policy.warningBeforeBreachMinutes, 2 * 60);
});
