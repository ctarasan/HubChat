import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const LEGACY_20260430_FUNCTION_HASH =
  "dc051f15855fbd9886a634788fb8b045a8c8e13076cbb8eb7f53f6049249eb1c";
const LEGACY_20260430_DATA_HASH =
  "0782ae1a8e4f565f421b7e9a0b46e311a2accab4deb47a04922e2952c412202b";

function sha256Hex(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function extractCreateOrReplaceFunction(sql: string): string {
  const match = sql.match(
    /create or replace function create_outbound_message_with_outbox[\s\S]*?\$\$;/i
  );
  assert.ok(match, "expected create_outbound_message_with_outbox definition");
  return match[0];
}

function extractHistoricalDataUpdate(sql: string): string {
  const match = sql.match(
    /update public\.conversations[\s\S]*?channel_thread_id not like 'user:%'\s*\)/i
  );
  assert.ok(match, "expected historical conversations update predicate");
  return match[0].trim();
}

test("legacy 20260430 canonical function migration remains unchanged", () => {
  const functionPath = join(
    migrationsDir,
    "20260430_add_conversation_ids_to_outbound_function.sql"
  );

  assert.equal(sha256Hex(functionPath), LEGACY_20260430_FUNCTION_HASH);
});

test("legacy 20260430 data migration content preserved after version rename", () => {
  const dataPath = join(
    migrationsDir,
    "20260431120000_reclassify_invalid_facebook_dm_threads.sql"
  );

  assert.equal(sha256Hex(dataPath), LEGACY_20260430_DATA_HASH);
});

test("legacy 20260430 data migration version sorts after canonical 20260430", () => {
  const names = listMigrationFiles();
  const idxCanonical = names.indexOf(
    "20260430_add_conversation_ids_to_outbound_function.sql"
  );
  const idxData = names.indexOf(
    "20260431120000_reclassify_invalid_facebook_dm_threads.sql"
  );
  const idxNext = names.indexOf("20260506_instagram_provider_thread_and_indexes.sql");

  assert.ok(idxCanonical >= 0 && idxData >= 0 && idxNext >= 0);
  assert.ok(idxCanonical < idxData);
  assert.ok(idxData < idxNext);
  assert.equal(extractTimestampVersion(names[idxData]), "20260431120000");
});

test("legacy 20260430 reconciliation migration ordering and uniqueness", () => {
  const names = listMigrationFiles();
  const legacyReconcile = "20260621150000_legacy_20260430_reconciliation.sql";

  assert.ok(names.includes(legacyReconcile));
  assert.equal(extractTimestampVersion(legacyReconcile), "20260621150000");

  const idxLegacy = names.indexOf(legacyReconcile);
  const idx2e6Reconcile = names.indexOf(
    "20260621140000_ig_auth_2d_instagram_oauth_identity_reconcile.sql"
  );
  assert.ok(idx2e6Reconcile >= 0);
  assert.ok(idxLegacy > idx2e6Reconcile);
});

test("legacy 20260430 reconciliation preserves final outbound function from 2E.3", () => {
  const legacyReconcilePath = join(
    migrationsDir,
    "20260621150000_legacy_20260430_reconciliation.sql"
  );
  const bindingPath = join(
    migrationsDir,
    "20260621130000_ig_auth_2e3_outbound_instagram_binding.sql"
  );

  const legacySql = readFileSync(legacyReconcilePath, "utf8");
  const bindingSql = readFileSync(bindingPath, "utf8");

  assert.match(legacySql, /p_conversation_ids jsonb/i);
  assert.match(legacySql, /p_instagram_credential_binding jsonb default null/i);
  assert.match(legacySql, /conversationIds/i);
  assert.match(legacySql, /instagramCredentialBinding/i);

  assert.equal(
    normalizeSqlForEquivalence(extractCreateOrReplaceFunction(legacySql)),
    normalizeSqlForEquivalence(extractCreateOrReplaceFunction(bindingSql))
  );
});

test("legacy 20260430 reconciliation data predicate matches historical migration", () => {
  const legacyReconcilePath = join(
    migrationsDir,
    "20260621150000_legacy_20260430_reconciliation.sql"
  );
  const historicalDataPath = join(
    migrationsDir,
    "20260431120000_reclassify_invalid_facebook_dm_threads.sql"
  );

  const legacySql = readFileSync(legacyReconcilePath, "utf8");
  const historicalSql = readFileSync(historicalDataPath, "utf8");

  assert.equal(
    normalizeSqlForEquivalence(extractHistoricalDataUpdate(legacySql)),
    normalizeSqlForEquivalence(extractHistoricalDataUpdate(historicalSql))
  );
});

test("legacy 20260430 reconciliation is structurally safe and idempotent", () => {
  const legacySql = readFileSync(
    join(migrationsDir, "20260621150000_legacy_20260430_reconciliation.sql"),
    "utf8"
  ).toLowerCase();

  assert.doesNotMatch(legacySql, /\bdelete\b/);
  assert.doesNotMatch(legacySql, /\btruncate\b/);
  assert.doesNotMatch(legacySql, /\bdrop table\b/);
  assert.match(legacySql, /create or replace function create_outbound_message_with_outbox/i);
  assert.match(legacySql, /provider_thread_type = 'messenger_dm'/);
  assert.match(legacySql, /provider_thread_type = 'facebook_comment'/);
});
