import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { startWorkerHealthServer, WORKER_HEALTH_SERVER_HOST } from "./workerHealthServer.js";
import {
  markLoopStarted,
  recordLoopClaimResult,
  recordLoopPoll,
  registerWorkerLoop,
  resetWorkerLoopSnapshotsForTests,
  touchLoopProgress
} from "./workerLoopLiveness.js";
import { buildWorkerHealthReadiness } from "./workerHealthReadiness.js";
import { markWorkerBootChecksOkForTests, resetWorkerBootGateForTests } from "./workerBootGate.js";

test.afterEach(() => {
  resetWorkerLoopSnapshotsForTests();
  resetWorkerBootGateForTests();
});

test("health server listens on 0.0.0.0 by default", async () => {
  const server = startWorkerHealthServer(0);
  await once(server, "listening");
  const addr = server.address();
  if (typeof addr === "string" || !addr) throw new Error("expected address");
  assert.equal(addr.address, WORKER_HEALTH_SERVER_HOST);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("/ready returns 503 before outbound first claim and 200 after", async () => {
  markWorkerBootChecksOkForTests();
  registerWorkerLoop("outbound", 200);
  registerWorkerLoop("inbound", 200);
  registerWorkerLoop("outboxRelay", 200);
  registerWorkerLoop("observability", 5000);

  const server = startWorkerHealthServer(0, { getReadiness: buildWorkerHealthReadiness });
  await once(server, "listening");
  const addr = server.address();
  if (typeof addr === "string" || !addr?.port) throw new Error("expected TCP port");
  const port = addr.port;

  const read = (): Promise<{ status: number; json: Record<string, unknown> }> =>
    new Promise((resolve, reject) => {
      http.get({ port, path: "/ready", host: "127.0.0.1" }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });

  const cold = await read();
  assert.equal(cold.status, 503);
  assert.equal(cold.json.status, "starting");

  for (const name of ["outbound", "inbound", "outboxRelay", "observability"] as const) {
    markLoopStarted(name);
    recordLoopPoll(name);
    if (name !== "observability") recordLoopClaimResult(name, 0);
    touchLoopProgress(name);
  }

  const warm = await read();
  assert.equal(warm.status, 200);
  assert.equal(warm.json.status, "healthy");

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
