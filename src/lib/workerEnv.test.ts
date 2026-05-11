import test from "node:test";
import assert from "node:assert/strict";
import type { WorkerEnv } from "./workerEnv.js";
import { resolveWorkerHealthListenPort, WORKER_LOCAL_DEFAULT_HEALTH_PORT } from "./workerEnv.js";

test("resolveWorkerHealthListenPort prefers WORKER_HEALTH_PORT over PORT", () => {
  const p = resolveWorkerHealthListenPort({
    WORKER_HEALTH_PORT: 9101,
    PORT: 9102
  } as WorkerEnv);
  assert.equal(p, 9101);
});

test("resolveWorkerHealthListenPort uses PORT when WORKER_HEALTH_PORT is missing", () => {
  const p = resolveWorkerHealthListenPort({
    PORT: 9103
  } as WorkerEnv);
  assert.equal(p, 9103);
});

test("resolveWorkerHealthListenPort reads raw process.env.PORT when parsed env omits PORT", () => {
  const prev = process.env.PORT;
  process.env.PORT = "9104";
  try {
    const p = resolveWorkerHealthListenPort({} as WorkerEnv);
    assert.equal(p, 9104);
  } finally {
    if (prev === undefined) delete process.env.PORT;
    else process.env.PORT = prev;
  }
});

test("resolveWorkerHealthListenPort falls back to local default when no port is available", () => {
  const prevP = process.env.PORT;
  const prevW = process.env.WORKER_HEALTH_PORT;
  delete process.env.PORT;
  delete process.env.WORKER_HEALTH_PORT;
  try {
    const p = resolveWorkerHealthListenPort({} as WorkerEnv);
    assert.equal(p, WORKER_LOCAL_DEFAULT_HEALTH_PORT);
  } finally {
    if (prevP === undefined) delete process.env.PORT;
    else process.env.PORT = prevP;
    if (prevW === undefined) delete process.env.WORKER_HEALTH_PORT;
    else process.env.WORKER_HEALTH_PORT = prevW;
  }
});
