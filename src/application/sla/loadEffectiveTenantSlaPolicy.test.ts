import test from "node:test";
import assert from "node:assert/strict";
import {
  loadEffectiveTenantSlaPolicy,
  type SlaPolicyOperationalFallbackContext
} from "./loadEffectiveTenantSlaPolicy.js";
import {
  buildDefaultTenantSlaPolicy,
  type TenantSlaPolicy,
  type TenantSlaPolicyRecord
} from "../../domain/tenantSlaPolicy.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

function tenantPolicyRecord(targetMinutes: number): TenantSlaPolicyRecord {
  const base = buildDefaultTenantSlaPolicy();
  return {
    ...base,
    tenantId: TENANT_ID,
    version: 2,
    rules: {
      ...base.rules,
      NEW_FIRST_RESPONSE: {
        ...base.rules.NEW_FIRST_RESPONSE,
        enabled: true,
        targetMinutes
      }
    },
    updatedAt: "2026-06-01T00:00:00.000Z",
    updatedByAuthUserId: null
  };
}

function assertDefaultPolicy(policy: TenantSlaPolicy): void {
  const expected = buildDefaultTenantSlaPolicy();
  assert.equal(policy.enabled, expected.enabled);
  assert.equal(policy.warningBeforeBreachMinutes, expected.warningBeforeBreachMinutes);
  assert.equal(policy.rules.NEW_FIRST_RESPONSE.targetMinutes, expected.rules.NEW_FIRST_RESPONSE.targetMinutes);
}

test("loadEffectiveTenantSlaPolicy returns default factory when repo row is null", async () => {
  const policy = await loadEffectiveTenantSlaPolicy(TENANT_ID, {
    findByTenantId: async () => null
  });
  assertDefaultPolicy(policy);
});

test("loadEffectiveTenantSlaPolicy returns tenant policy when repo row exists", async () => {
  const row = tenantPolicyRecord(75);
  const policy = await loadEffectiveTenantSlaPolicy(TENANT_ID, {
    findByTenantId: async () => row
  });
  assert.equal(policy.version, 2);
  assert.equal(policy.rules.NEW_FIRST_RESPONSE.targetMinutes, 75);
});

test("loadEffectiveTenantSlaPolicy logs operational fallback when findByTenantId throws", async () => {
  const fallbackCalls: SlaPolicyOperationalFallbackContext[] = [];
  const policy = await loadEffectiveTenantSlaPolicy(
    TENANT_ID,
    {
      findByTenantId: async () => {
        const err = new Error("Could not find table tenant_sla_policies") as Error & { code?: string };
        err.code = "PGRST205";
        throw err;
      }
    },
    {
      onOperationalFallback: (context) => {
        fallbackCalls.push(context);
      }
    }
  );

  assertDefaultPolicy(policy);
  assert.equal(fallbackCalls.length, 1);
  assert.equal(fallbackCalls[0]?.tenantId, TENANT_ID);
  assert.equal(fallbackCalls[0]?.operation, "findByTenantId");
  assert.equal(fallbackCalls[0]?.reason, "repository_query_failed");
  assert.equal(fallbackCalls[0]?.error.code, "PGRST205");
  assert.match(fallbackCalls[0]?.error.message ?? "", /tenant_sla_policies/i);
});

test("loadEffectiveTenantSlaPolicy logs operational fallback when runtime repository cannot be created", async () => {
  const fallbackCalls: SlaPolicyOperationalFallbackContext[] = [];
  const policy = await loadEffectiveTenantSlaPolicy(TENANT_ID, undefined, {
    createRuntimeRepo: () => {
      throw new Error("Supabase service client unavailable");
    },
    onOperationalFallback: (context) => {
      fallbackCalls.push(context);
    }
  });

  assertDefaultPolicy(policy);
  assert.equal(fallbackCalls.length, 1);
  assert.equal(fallbackCalls[0]?.tenantId, TENANT_ID);
  assert.equal(fallbackCalls[0]?.operation, "resolveRepository");
  assert.equal(fallbackCalls[0]?.reason, "repository_unavailable");
  assert.match(fallbackCalls[0]?.error.message ?? "", /Supabase service client unavailable/);
});

test("loadEffectiveTenantSlaPolicy null row does not invoke operational fallback callback", async () => {
  const fallbackCalls: SlaPolicyOperationalFallbackContext[] = [];
  await loadEffectiveTenantSlaPolicy(
    TENANT_ID,
    { findByTenantId: async () => null },
    {
      onOperationalFallback: (context) => {
        fallbackCalls.push(context);
      }
    }
  );
  assert.equal(fallbackCalls.length, 0);
});
