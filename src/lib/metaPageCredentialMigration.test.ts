import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260623120000_meta_cred_1c_shared_meta_page_credentials.sql"),
  "utf8"
);

test("META-CRED-1C migration is additive and defines meta_page_credentials", () => {
  assert.match(migrationSql, /create table if not exists meta_page_credentials/i);
  assert.match(migrationSql, /meta_page_credential_family/i);
  assert.match(migrationSql, /meta_page_credential_status/i);
  assert.match(migrationSql, /meta_page_binding_status/i);
  assert.match(migrationSql, /encrypted_access_token/i);
  assert.match(migrationSql, /token_fingerprint/i);
  assert.match(migrationSql, /credential_version integer not null default 1/i);
});

test("META-CRED-1C migration enforces META_PAGE_FACEBOOK_LOGIN family only", () => {
  assert.match(migrationSql, /'META_PAGE_FACEBOOK_LOGIN'/i);
  assert.match(migrationSql, /meta_page_credentials_family_scope/i);
  assert.doesNotMatch(migrationSql, /INSTAGRAM_BUSINESS_LOGIN/);
});

test("META-CRED-1C migration enforces ciphertext for ACTIVE credentials", () => {
  assert.match(migrationSql, /meta_page_credentials_active_ciphertext_required/i);
  assert.match(migrationSql, /meta_page_credentials_active_requires_verified/i);
  assert.match(migrationSql, /length\(btrim\(encrypted_access_token\)\) > 0/i);
});

test("META-CRED-1C migration defines binding table with composite tenant FKs", () => {
  assert.match(migrationSql, /create table if not exists meta_page_credential_bindings/i);
  assert.match(migrationSql, /meta_page_bindings_tenant_credential_fk/i);
  assert.match(migrationSql, /meta_page_bindings_tenant_connection_fk/i);
  assert.match(migrationSql, /references meta_page_credentials \(tenant_id, id\)/i);
  assert.match(migrationSql, /references channel_connections \(tenant_id, id\)/i);
  assert.match(migrationSql, /on delete restrict/i);
  assert.match(migrationSql, /on delete cascade/i);
});

test("META-CRED-1C migration enforces tenant composite unique on credentials", () => {
  assert.match(migrationSql, /idx_meta_page_credentials_tenant_id/i);
  assert.match(migrationSql, /unique index if not exists idx_meta_page_credentials_tenant_id/i);
});

test("META-CRED-1C migration protects one active binding per connection", () => {
  assert.match(migrationSql, /idx_meta_page_bindings_active_connection/i);
  assert.match(migrationSql, /where binding_status = 'ACTIVE'/i);
});

test("META-CRED-1C migration allows one Facebook and one Instagram binding per credential", () => {
  assert.match(migrationSql, /idx_meta_page_bindings_active_channel_per_credential/i);
  assert.match(migrationSql, /tenant_id, credential_id, channel_type/i);
});

test("META-CRED-1C migration restricts binding channel types to FACEBOOK and INSTAGRAM", () => {
  assert.match(migrationSql, /meta_page_bindings_channel_type_scope/i);
  assert.match(migrationSql, /'FACEBOOK'::channel_type, 'INSTAGRAM'::channel_type/i);
});

test("META-CRED-1C migration enables RLS on credential and binding tables", () => {
  assert.match(migrationSql, /alter table meta_page_credentials enable row level security/i);
  assert.match(migrationSql, /alter table meta_page_credential_bindings enable row level security/i);
});

test("META-CRED-1C migration has no destructive statements in forward migration", () => {
  const forwardSql = migrationSql.split("-- Rollback notes")[0] ?? migrationSql;
  assert.doesNotMatch(forwardSql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(forwardSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(forwardSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(forwardSql, /plaintext/i);
});

test("META-CRED-1C migration documents rollback notes", () => {
  assert.match(migrationSql, /Rollback notes/i);
  assert.match(migrationSql, /drop table if exists meta_page_credential_bindings/i);
  assert.match(migrationSql, /drop table if exists meta_page_credentials/i);
});

test("META-CRED-1C migration version prefix is unique among migration files", () => {
  const files = readdirSync(join(repoRoot, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
  const prefix = "20260623120000";
  const matches = files.filter((n) => n.startsWith(prefix));
  assert.equal(matches.length, 1);
  assert.equal(matches[0], "20260623120000_meta_cred_1c_shared_meta_page_credentials.sql");
});
