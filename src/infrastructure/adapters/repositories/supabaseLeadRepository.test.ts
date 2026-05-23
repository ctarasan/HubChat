import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseLeadRepository } from "./supabaseLeadRepository.js";

test("patch scopes update by tenant_id and lead id", async () => {
  let patched: Record<string, unknown> = {};
  const eqCalls: Array<[string, string]> = [];
  const fakeSupabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => {
          eqCalls.push([col, val]);
          if (eqCalls.length === 2) {
            patched = patch;
            return Promise.resolve({ error: null });
          }
          return {
            eq: (col2: string, val2: string) => {
              eqCalls.push([col2, val2]);
              patched = patch;
              return Promise.resolve({ error: null });
            }
          };
        }
      })
    })
  } as any;
  const repo = new SupabaseLeadRepository(fakeSupabase);
  await repo.patch("tenant-1", "lead-1", { status: "WON" });
  assert.equal(patched.status, "WON");
  assert.ok(patched.updated_at);
  assert.deepEqual(eqCalls, [
    ["tenant_id", "tenant-1"],
    ["id", "lead-1"]
  ]);
});
