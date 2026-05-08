import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const enumSql = readFileSync(
  new URL("../../../supabase/migrations/20260508000100_sprint1_lead_status_enum_extension.sql", import.meta.url),
  "utf8"
);
const foundationSql = readFileSync(
  new URL("../../../supabase/migrations/20260508000200_sprint1_lead_assignment_foundation.sql", import.meta.url),
  "utf8"
);

test("sprint1 enum migration only extends lead_status values", () => {
  assert.equal(enumSql.includes("alter type lead_status add value if not exists 'UNASSIGNED'"), true);
  assert.equal(enumSql.includes("alter type lead_status add value if not exists 'IN_PROGRESS'"), true);
  assert.equal(enumSql.includes("alter type lead_status add value if not exists 'CLOSED'"), true);
  assert.equal(enumSql.includes("insert into leads"), false);
  assert.equal(enumSql.includes("alter table leads alter column status set default"), false);
});

test("sprint1 migration creates lead_assignments and lead_events tables", () => {
  assert.equal(foundationSql.includes("create table if not exists lead_assignments"), true);
  assert.equal(foundationSql.includes("create table if not exists lead_events"), true);
});

test("sprint1 migration contains idempotent backfill for conversations without lead_id", () => {
  assert.equal(foundationSql.includes("where c.lead_id is null"), true);
  assert.equal(foundationSql.includes("on conflict (tenant_id, source_channel, external_user_id) do update"), true);
  assert.equal(foundationSql.includes("hubchat.lead.created"), true);
});

test("sprint1 migration includes assignment/scaling indexes", () => {
  assert.equal(foundationSql.includes("idx_leads_tenant_status_created_desc"), true);
  assert.equal(foundationSql.includes("idx_conversations_lead_id"), true);
  assert.equal(foundationSql.includes("idx_lead_assignments_tenant_lead_created_desc"), true);
  assert.equal(foundationSql.includes("idx_lead_events_tenant_lead_occurred_desc"), true);
});

test("sprint1 foundation migration does not silently swallow broad schema exceptions", () => {
  assert.equal(foundationSql.includes("when others then"), false);
});
