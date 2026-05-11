import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DbQueue } from "./dbQueue.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(here, "../../../../supabase/migrations/20260509000100_reclaim_stuck_processing_queue_jobs.sql"), "utf8");

test("claimBatch passes processing timeout to claim_queue_jobs RPC", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, ...args });
      return { data: [], error: null };
    },
    from: () => {
      throw new Error("not used");
    }
  };
  const queue = new DbQueue(supabase as any, 240);
  await queue.claimBatch("message.inbound.normalized", { limit: 5, processingTimeoutSeconds: 180 });

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]?.name, "claim_queue_jobs");
  assert.equal(rpcCalls[0]?.p_topic, "message.inbound.normalized");
  assert.equal(rpcCalls[0]?.p_limit, 5);
  assert.equal(rpcCalls[0]?.p_processing_timeout_seconds, 180);
});

test("hotfix migration SQL reclaims stuck PROCESSING jobs", () => {
  assert.match(migrationSql, /p_processing_timeout_seconds/);
  assert.match(migrationSql, /q\.status = 'PROCESSING'/);
});

test("claimBatch falls back to 2-arg RPC when 3-arg claim_queue_jobs is missing", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  let call = 0;
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, ...args });
      call += 1;
      if (call === 1) {
        return {
          data: null,
          error: { message: "function claim_queue_jobs(uuid, text, int) does not exist", code: "42883" }
        };
      }
      return { data: [], error: null };
    },
    from: () => {
      throw new Error("not used");
    }
  };
  const queue = new DbQueue(supabase as any);
  await queue.claimBatch("message.inbound.normalized", { limit: 3 });

  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[1]?.p_topic, "message.inbound.normalized");
  assert.equal(rpcCalls[1]?.p_limit, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(rpcCalls[1] ?? {}, "p_processing_timeout_seconds"), false);
});

test("markDone clears last_error on queue_jobs", async () => {
  let updatePayload: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updatePayload = patch;
        return {
          eq: async (_col: string, _val: string) => ({ error: null })
        };
      }
    })
  };
  const queue = new DbQueue(supabase as any);
  await queue.markDone("job-uuid-1");
  assert.ok(updatePayload);
  const patch = updatePayload as Record<string, unknown>;
  assert.equal(patch["status"], "DONE");
  assert.equal(patch["last_error"], null);
});
