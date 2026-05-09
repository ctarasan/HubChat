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
