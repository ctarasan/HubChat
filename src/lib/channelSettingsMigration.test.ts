import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260520120000_phase_ii_g1_a_channel_settings.sql"),
  "utf8"
);
const schemaSql = readFileSync(join(repoRoot, "supabase/schema.sql"), "utf8");

function channelSettingsBlock(sql: string): string {
  const start = sql.indexOf("create table if not exists channel_settings");
  assert.ok(start >= 0, "channel_settings table definition missing");
  const end = sql.indexOf("create index if not exists idx_channel_settings_tenant", start);
  return sql.slice(start, end >= 0 ? end : start + 1200);
}

test("G1-A migration ensures channel_type exists before channel_settings", () => {
  const typePos = migrationSql.search(/create type public\.channel_type/i);
  const tablePos = migrationSql.search(/create table if not exists channel_settings/i);
  assert.ok(typePos >= 0, "channel_type enum bootstrap missing");
  assert.ok(tablePos > typePos, "channel_type must be created before channel_settings");
  assert.match(migrationSql, /when duplicate_object then null/i);
});

test("G1-A migration channel_settings has no tenants foreign key", () => {
  const block = channelSettingsBlock(migrationSql);
  assert.match(block, /tenant_id uuid not null/i);
  assert.doesNotMatch(block, /references\s+tenants/i);
  assert.match(migrationSql, /drop constraint if exists channel_settings_tenant_id_fkey/i);
});

test("G1-A migration keeps tenant/channel uniqueness and JSON object constraints", () => {
  assert.match(migrationSql, /unique \(tenant_id, channel\)/i);
  assert.match(migrationSql, /channel_settings_g1_channel_scope/i);
  assert.match(migrationSql, /jsonb_typeof\(config_json\) = 'object'/i);
  assert.match(migrationSql, /jsonb_typeof\(secret_json\) = 'object'/i);
  assert.match(migrationSql, /jsonb_typeof\(secret_fingerprint_json\) = 'object'/i);
});

test("schema.sql channel_settings mirror has no tenants foreign key", () => {
  const block = channelSettingsBlock(schemaSql);
  assert.match(block, /tenant_id uuid not null/i);
  assert.doesNotMatch(block, /references\s+tenants/i);
  assert.match(schemaSql, /idx_channel_settings_tenant/i);
});
