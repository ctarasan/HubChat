import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260619120000_ig_auth_2a_instagram_oauth_credential_foundation.sql"),
  "utf8"
);

test("IG-AUTH-2A migration is additive and defines instagram_oauth_credentials", () => {
  assert.match(migrationSql, /create table if not exists instagram_oauth_credentials/i);
  assert.match(migrationSql, /instagram_oauth_auth_family/i);
  assert.match(migrationSql, /instagram_oauth_credential_status/i);
  assert.match(migrationSql, /instagram_oauth_refresh_status/i);
  assert.match(migrationSql, /idx_channel_connections_tenant_id/i);
  assert.match(migrationSql, /instagram_oauth_credentials_tenant_connection_fk/i);
  assert.match(migrationSql, /access_token_ciphertext text not null default ''/i);
  assert.match(migrationSql, /credential_version integer not null default 1/i);
});

test("IG-AUTH-2A migration enforces ciphertext for token-bearing statuses", () => {
  assert.match(migrationSql, /instagram_oauth_credentials_active_ciphertext_required/i);
  assert.match(migrationSql, /'ACTIVE'/i);
  assert.match(migrationSql, /'REAUTH_REQUIRED'/i);
  assert.match(migrationSql, /length\(btrim\(access_token_ciphertext\)\) > 0/i);
});

test("IG-AUTH-2A migration has no destructive statements in forward migration", () => {
  const forwardSql = migrationSql.split("-- Rollback notes")[0] ?? migrationSql;
  assert.doesNotMatch(forwardSql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(forwardSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(forwardSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(forwardSql, /plaintext/i);
});

test("IG-AUTH-2A migration protects one active credential per connection", () => {
  assert.match(migrationSql, /idx_instagram_oauth_credentials_active_connection/i);
  assert.match(migrationSql, /where credential_status in/i);
  assert.match(migrationSql, /'REVOKED'/i);
  assert.match(migrationSql, /'DISCONNECTED'/i);
});

test("IG-AUTH-2A migration prevents active duplicate Instagram account binding", () => {
  assert.match(migrationSql, /idx_instagram_oauth_credentials_active_ig_account/i);
  assert.match(migrationSql, /provider_instagram_account_id/i);
});

test("IG-AUTH-2A migration documents rollback notes", () => {
  assert.match(migrationSql, /Rollback notes/i);
  assert.match(migrationSql, /drop table if exists instagram_oauth_credentials/i);
});

test("IG-AUTH-2A migration does not use REFRESH_TOKEN credential type", () => {
  assert.doesNotMatch(migrationSql, /REFRESH_TOKEN/);
});

test("CCP-1 legacy channel_credentials migration remains valid alongside IG-AUTH-2A", () => {
  const ccpSql = readFileSync(
    join(repoRoot, "supabase/migrations/20260604120000_ccp_1_channel_connection_foundation.sql"),
    "utf8"
  );
  assert.match(ccpSql, /create table if not exists channel_credentials/i);
  assert.match(ccpSql, /unique \(connection_id, credential_type\)/i);
});
