import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationSql = readFileSync(
  join(repoRoot, "supabase/migrations/20260720120000_message_templates_v1.sql"),
  "utf8"
);

test("message templates migration creates additive table with required columns", () => {
  assert.match(migrationSql, /create table if not exists message_templates/i);
  assert.match(migrationSql, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migrationSql, /tenant_id uuid not null/i);
  assert.match(migrationSql, /owner_user_id uuid not null/i);
  assert.match(migrationSql, /title text not null/i);
  assert.match(migrationSql, /body text not null/i);
  assert.match(migrationSql, /created_at timestamptz not null default now\(\)/i);
  assert.match(migrationSql, /updated_at timestamptz not null default now\(\)/i);
});

test("message templates migration enforces title/body length and owner index", () => {
  assert.match(migrationSql, /message_templates_title_len/i);
  assert.match(migrationSql, /char_length\(btrim\(title\)\) between 1 and 120/i);
  assert.match(migrationSql, /message_templates_body_len/i);
  assert.match(migrationSql, /char_length\(body\) between 1 and 10000/i);
  assert.match(
    migrationSql,
    /idx_message_templates_owner_updated[\s\S]*tenant_id,\s*owner_user_id,\s*updated_at desc/i
  );
});

test("message templates migration enables RLS without policies or seed data", () => {
  assert.match(migrationSql, /alter table message_templates enable row level security/i);
  assert.doesNotMatch(migrationSql, /create policy/i);
  assert.doesNotMatch(migrationSql, /insert into message_templates/i);
});

test("message templates migration does not alter chat operational tables", () => {
  assert.doesNotMatch(migrationSql, /alter table messages/i);
  assert.doesNotMatch(migrationSql, /alter table conversations/i);
  assert.doesNotMatch(migrationSql, /drop table/i);
});
