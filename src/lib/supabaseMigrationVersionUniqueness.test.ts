import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = join(repoRoot, "supabase/migrations");

const TIMESTAMP_MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/i;

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function extractTimestampVersion(filename: string): string | null {
  const match = filename.match(TIMESTAMP_MIGRATION_PATTERN);
  return match ? match[1] : null;
}

function normalizeSqlForEquivalence(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

test("supabase migrations use unique 14-digit timestamp version prefixes", () => {
  const byVersion = new Map<string, string[]>();

  for (const name of listMigrationFiles()) {
    const version = extractTimestampVersion(name);
    if (!version) continue;
    const group = byVersion.get(version) ?? [];
    group.push(name);
    byVersion.set(version, group);
  }

  const duplicates = [...byVersion.entries()].filter(([, names]) => names.length > 1);
  if (duplicates.length > 0) {
    const detail = duplicates
      .map(([version, names]) => `${version}: ${names.join(", ")}`)
      .join("; ");
    assert.fail(`Duplicate Supabase migration versions detected: ${detail}`);
  }
});

test("IG-AUTH-2E.3 outbound binding migration retains reviewed SQL body", () => {
  const renamedPath = join(
    migrationsDir,
    "20260621130000_ig_auth_2e3_outbound_instagram_binding.sql"
  );
  const renamedSql = readFileSync(renamedPath, "utf8");

  assert.match(renamedSql, /p_instagram_credential_binding jsonb default null/i);
  assert.match(renamedSql, /create or replace function create_outbound_message_with_outbox/i);
  assert.match(renamedSql, /instagramCredentialBinding/i);

  const historicalSql = execSync(
    "git show 43b98fb:supabase/migrations/20260621120000_ig_auth_2e3_outbound_instagram_binding.sql",
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(
    normalizeSqlForEquivalence(renamedSql),
    normalizeSqlForEquivalence(historicalSql),
    "renamed 2E.3 migration must match reviewed SQL from PR #254"
  );
});

test("IG-AUTH-2D reconciliation migration is idempotent", () => {
  const reconcileSql = readFileSync(
    join(migrationsDir, "20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql"),
    "utf8"
  );
  const original2dSql = readFileSync(
    join(migrationsDir, "20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql"),
    "utf8"
  );

  for (const column of [
    "verified_username",
    "verified_account_type",
    "identity_verified_at"
  ]) {
    assert.match(reconcileSql, new RegExp(`add column if not exists ${column}`, "i"));
  }
  assert.match(reconcileSql, /drop constraint if exists instagram_oauth_credentials_verified_account_type_scope/i);
  assert.match(reconcileSql, /instagram_oauth_credentials_verified_account_type_scope/i);

  assert.equal(
    normalizeSqlForEquivalence(reconcileSql),
    normalizeSqlForEquivalence(original2dSql)
  );
});

test("final migration ordering places 2D, 2E.3, then reconciliation", () => {
  const names = listMigrationFiles();
  const idx2d = names.indexOf("20260621120000_ig_auth_2d_instagram_oauth_identity_verification.sql");
  const idx2e3 = names.indexOf("20260621130000_ig_auth_2e3_outbound_instagram_binding.sql");
  const idxReconcile = names.indexOf(
    "20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql"
  );

  assert.ok(idx2d >= 0 && idx2e3 >= 0 && idxReconcile >= 0);
  assert.ok(idx2d < idx2e3);
  assert.ok(idx2e3 < idxReconcile);
});
