import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkerEnv } from "./workerEnv.js";

const base = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key"
};

test("parseWorkerEnv rejects poll interval below minimum", () => {
  assert.throws(
    () =>
      parseWorkerEnv({
        ...base,
        WORKER_POLL_INTERVAL_MS: "10"
      } as unknown as NodeJS.ProcessEnv),
    /WORKER_POLL_INTERVAL_MS/
  );
});

test("parseWorkerEnv accepts defaults for new timeout fields", () => {
  const env = parseWorkerEnv(base as unknown as NodeJS.ProcessEnv);
  assert.equal(env.WORKER_QUEUE_CLAIM_TIMEOUT_MS, 45_000);
  assert.equal(env.WORKER_OUTBOUND_RUN_ONCE_TIMEOUT_MS, 60_000);
});
