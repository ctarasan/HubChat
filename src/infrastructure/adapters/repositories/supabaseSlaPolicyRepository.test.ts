import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SupabaseSlaPolicyRepository } from "./supabaseSlaPolicyRepository.js";
import { buildDefaultTenantSlaPolicy } from "../../../domain/tenantSlaPolicy.js";
import { isSlaPolicyVersionConflict } from "../../../domain/slaPolicyApi.js";

const here = dirname(fileURLToPath(import.meta.url));
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const AUTH_USER = "33333333-3333-4333-8333-333333333333";

test("SLA-1 migration defines tenant_sla_policies with constraints", () => {
  const sql = readFileSync(
    join(here, "../../../../supabase/migrations/20260601120000_phase_ii_sla1_tenant_sla_policies.sql"),
    "utf8"
  );
  assert.match(sql, /create table if not exists tenant_sla_policies/i);
  assert.match(sql, /tenant_id uuid primary key/i);
  assert.match(sql, /warning_before_breach_minutes integer not null/i);
  assert.match(sql, /tenant_sla_policies_warning_positive/i);
  assert.match(sql, /jsonb_typeof\(rules\) = 'object'/i);
});

test("schema.sql mirrors tenant_sla_policies table", () => {
  const sql = readFileSync(join(here, "../../../../supabase/schema.sql"), "utf8");
  assert.match(sql, /create table if not exists tenant_sla_policies/i);
  assert.match(sql, /idx_tenant_sla_policies_tenant/i);
});

function makePolicy(version: number) {
  const base = buildDefaultTenantSlaPolicy();
  return { ...base, version };
}

test("repository create persists tenant row with version 1", async () => {
  let inserted: Record<string, unknown> | undefined;
  const repo = new SupabaseSlaPolicyRepository({
    from(table: string) {
      assert.equal(table, "tenant_sla_policies");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: Record<string, unknown>) {
          inserted = payload;
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: {
                      tenant_id: TENANT_A,
                      enabled: payload.enabled,
                      warning_before_breach_minutes: payload.warning_before_breach_minutes,
                      exclude_resolved: payload.exclude_resolved,
                      exclude_archived: payload.exclude_archived,
                      rules: payload.rules,
                      version: payload.version,
                      updated_at: payload.updated_at,
                      updated_by_auth_user_id: payload.updated_by_auth_user_id
                    },
                    error: null
                  });
                }
              };
            }
          };
        }
      };
    }
  } as any);

  const saved = await repo.create({
    tenantId: TENANT_A,
    policy: makePolicy(1),
    updatedByAuthUserId: AUTH_USER
  });

  assert.equal(saved.tenantId, TENANT_A);
  assert.equal(saved.version, 1);
  assert.equal(inserted?.["tenant_id"], TENANT_A);
  assert.equal(inserted?.["updated_by_auth_user_id"], AUTH_USER);
});

test("repository update increments version on matching expectedVersion", async () => {
  const existing = {
    tenant_id: TENANT_A,
    enabled: true,
    warning_before_breach_minutes: 120,
    exclude_resolved: false,
    exclude_archived: false,
    rules: buildDefaultTenantSlaPolicy().rules,
    version: 2,
    updated_at: "2026-06-01T00:00:00.000Z",
    updated_by_auth_user_id: AUTH_USER
  };
  let updatePayload: Record<string, unknown> | undefined;

  const repo = new SupabaseSlaPolicyRepository({
    from() {
      return {
        select() {
          return this;
        },
        eq(_col: string, val: unknown) {
          this._tenant = val;
          return this;
        },
        maybeSingle() {
          if (this._mode === "update-result") {
            return Promise.resolve({
              data: {
                ...existing,
                version: 3,
                warning_before_breach_minutes: 90,
                updated_at: "2026-06-01T01:00:00.000Z"
              },
              error: null
            });
          }
          return Promise.resolve({ data: existing, error: null });
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          this._mode = "update-result";
          return this;
        },
        _tenant: null as unknown,
        _mode: "lookup" as string
      };
    }
  } as any);

  const saved = await repo.update({
    tenantId: TENANT_A,
    expectedVersion: 2,
    policy: { ...makePolicy(2), warningBeforeBreachMinutes: 90 },
    updatedByAuthUserId: AUTH_USER
  });

  assert.equal(saved.version, 3);
  assert.equal(updatePayload?.["version"], 3);
});

test("repository update throws version conflict for stale expectedVersion", async () => {
  const repo = new SupabaseSlaPolicyRepository({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              tenant_id: TENANT_A,
              enabled: true,
              warning_before_breach_minutes: 120,
              exclude_resolved: false,
              exclude_archived: false,
              rules: buildDefaultTenantSlaPolicy().rules,
              version: 4,
              updated_at: "2026-06-01T00:00:00.000Z",
              updated_by_auth_user_id: AUTH_USER
            },
            error: null
          });
        }
      };
    }
  } as any);

  await assert.rejects(
    () =>
      repo.update({
        tenantId: TENANT_A,
        expectedVersion: 3,
        policy: makePolicy(3),
        updatedByAuthUserId: AUTH_USER
      }),
    (error: unknown) => isSlaPolicyVersionConflict(error) && error.currentVersion === 4
  );
});

test("repository findByTenantId enforces tenant filter argument", async () => {
  const eqCalls: Array<[string, unknown]> = [];
  const repo = new SupabaseSlaPolicyRepository({
    from() {
      return {
        select() {
          return this;
        },
        eq(col: string, val: unknown) {
          eqCalls.push([col, val]);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  } as any);

  await repo.findByTenantId(TENANT_B);
  assert.deepEqual(eqCalls, [["tenant_id", TENANT_B]]);
});
