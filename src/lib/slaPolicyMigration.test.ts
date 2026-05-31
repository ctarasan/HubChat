import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260601120000_phase_ii_sla1_tenant_sla_policies.sql"),
  "utf8"
);
const schemaSql = readFileSync(join(repoRoot, "supabase/schema.sql"), "utf8");

test("SLA-1 migration tenant_sla_policies has no tenants foreign key", () => {
  assert.match(migrationSql, /tenant_id uuid primary key/i);
  assert.doesNotMatch(migrationSql, /references\s+tenants/i);
});

test("SLA-1 migration defines warning and rules object constraints", () => {
  assert.match(migrationSql, /tenant_sla_policies_warning_positive/i);
  assert.match(migrationSql, /tenant_sla_policies_rules_object/i);
  assert.match(migrationSql, /idx_tenant_sla_policies_tenant/i);
});

test("schema.sql mirrors tenant_sla_policies without tenants FK", () => {
  const start = schemaSql.indexOf("create table if not exists tenant_sla_policies");
  assert.ok(start >= 0);
  const block = schemaSql.slice(start, start + 900);
  assert.doesNotMatch(block, /references\s+tenants/i);
  assert.match(schemaSql, /idx_tenant_sla_policies_tenant/i);
});
