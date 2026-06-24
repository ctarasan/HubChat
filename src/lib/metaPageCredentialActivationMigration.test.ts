import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = join(
  repoRoot,
  "supabase/migrations/20260624120000_meta_cred_1d_activation_rpc.sql"
);
const migrationSql = readFileSync(migrationPath, "utf8");

test("META-CRED-1D-B migration version prefix is unique", () => {
  const files = readdirSync(join(repoRoot, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
  const prefix = "20260624120000";
  const matches = files.filter((n) => n.startsWith(prefix));
  assert.equal(matches.length, 1);
  assert.equal(matches[0], "20260624120000_meta_cred_1d_activation_rpc.sql");
});

test("META-CRED-1D-B adds verified metadata columns", () => {
  assert.match(migrationSql, /add column if not exists granted_scopes text\[\]/i);
  assert.match(migrationSql, /add column if not exists token_expires_at timestamptz/i);
  assert.match(migrationSql, /add column if not exists data_access_expires_at timestamptz/i);
  assert.match(migrationSql, /add column if not exists provider_token_type text/i);
  assert.match(migrationSql, /add column if not exists verification_version integer/i);
});

test("META-CRED-1D-B defines tenant-scoped activation idempotency table", () => {
  assert.match(migrationSql, /create table if not exists public\.meta_page_credential_activation_requests/i);
  assert.match(migrationSql, /idx_meta_page_activation_requests_tenant_key/i);
  assert.match(migrationSql, /on public\.meta_page_credential_activation_requests \(tenant_id, idempotency_key\)/i);
  assert.match(migrationSql, /enable row level security/i);
});

test("META-CRED-1D-B defines activate_meta_page_credential_tx RPC", () => {
  assert.match(migrationSql, /create or replace function public\.activate_meta_page_credential_tx/i);
  assert.match(migrationSql, /security definer/i);
  assert.match(migrationSql, /set search_path = public, pg_temp/i);
  assert.match(migrationSql, /p_encrypted_access_token text/i);
  assert.doesNotMatch(migrationSql, /p_plaintext_access_token/i);
  assert.doesNotMatch(migrationSql, /p_access_token text/i);
});

test("META-CRED-1D-B RPC revokes public execute and grants service_role only", () => {
  assert.match(migrationSql, /revoke all on function public\.activate_meta_page_credential_tx/i);
  assert.match(migrationSql, /from public/i);
  assert.match(migrationSql, /from anon/i);
  assert.match(migrationSql, /from authenticated/i);
  assert.match(migrationSql, /grant execute on function public\.activate_meta_page_credential_tx/i);
  assert.match(migrationSql, /to service_role/i);
});

test("META-CRED-1D-B RPC returns pending health activation status", () => {
  assert.match(migrationSql, /'ACTIVATED_PENDING_HEALTH'/i);
  assert.doesNotMatch(migrationSql, /channel_settings/i);
  assert.doesNotMatch(migrationSql, /'READY'/i);
});

test("META-CRED-1D-B does not implement rotation RPC", () => {
  assert.doesNotMatch(migrationSql, /rotate_meta_page_credential_tx/i);
});

test("META-CRED-1D-B migration has no destructive forward DDL", () => {
  const forwardSql = migrationSql.split("-- Rollback notes")[0] ?? migrationSql;
  assert.doesNotMatch(forwardSql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(forwardSql, /\bTRUNCATE\b/i);
});

test("META-CRED-1D-B does not modify 1C foundation migration file", () => {
  const foundation = readFileSync(
    join(repoRoot, "supabase/migrations/20260623120000_meta_cred_1c_shared_meta_page_credentials.sql"),
    "utf8"
  );
  assert.doesNotMatch(foundation, /activate_meta_page_credential_tx/i);
  assert.doesNotMatch(foundation, /meta_page_credential_activation_requests/i);
});
