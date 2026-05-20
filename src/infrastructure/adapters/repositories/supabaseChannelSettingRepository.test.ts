import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SupabaseChannelSettingRepository } from "./supabaseChannelSettingRepository.js";

const here = dirname(fileURLToPath(import.meta.url));

test("G1-A migration defines channel_settings with constraints", () => {
  const sql = readFileSync(
    join(here, "../../../../supabase/migrations/20260520120000_phase_ii_g1_a_channel_settings.sql"),
    "utf8"
  );
  assert.match(sql, /create table if not exists channel_settings/i);
  assert.match(sql, /unique \(tenant_id, channel\)/i);
  assert.match(sql, /channel_settings_g1_channel_scope/i);
  assert.match(sql, /jsonb_typeof\(config_json\) = 'object'/i);
  assert.match(sql, /jsonb_typeof\(secret_json\) = 'object'/i);
});

test("schema.sql mirrors channel_settings table", () => {
  const sql = readFileSync(join(here, "../../../../supabase/schema.sql"), "utf8");
  assert.match(sql, /create table if not exists channel_settings/i);
  assert.match(sql, /idx_channel_settings_tenant/i);
});

test("listByTenant select omits secret_json", () => {
  const repo = new SupabaseChannelSettingRepository({
    from() {
      return {
        select(columns: string) {
          assert.equal(columns.includes("secret_json"), false);
          assert.equal(columns.includes("secret_fingerprint_json"), true);
          return {
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({ data: [], error: null });
            }
          };
        }
      };
    }
  } as any);
  return repo.listByTenant("tenant-1").then((rows) => assert.deepEqual(rows, []));
});
