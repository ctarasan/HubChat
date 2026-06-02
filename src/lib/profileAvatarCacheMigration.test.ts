import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260602120000_phase_ii_profile_avatar_cache.sql"),
  "utf8"
);
const schemaSql = readFileSync(join(repoRoot, "supabase/schema.sql"), "utf8");

test("profile avatar cache migration adds contact_identities cache columns", () => {
  assert.match(migrationSql, /profile_image_cached_path text null/i);
  assert.match(migrationSql, /profile_image_cached_at timestamptz null/i);
  assert.match(migrationSql, /profile_image_cache_status text null/i);
  assert.match(migrationSql, /profile_image_source_url_hash text null/i);
  assert.match(migrationSql, /pending.*ok.*failed.*skipped/s);
});

test("schema.sql mirrors profile avatar cache columns on contact_identities", () => {
  assert.match(schemaSql, /profile_image_cached_path text null/i);
  assert.match(schemaSql, /profile_image_cache_status text null/i);
  assert.match(schemaSql, /contact_identities_profile_image_cache_status_valid/i);
});
