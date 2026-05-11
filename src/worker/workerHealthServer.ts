import http from "node:http";
import pino from "pino";
import { workerMetrics } from "./workerMetrics.js";

const logger = pino({ name: "worker-health-server" });

export interface WorkerHealthReadiness {
  ok: boolean;
  body: Record<string, unknown>;
}

export function startWorkerHealthServer(
  port: number,
  opts?: { getReadiness?: () => WorkerHealthReadiness }
): http.Server {
  const server = http.createServer((_req, res) => {
    const url = (_req.url ?? "/").split("?")[0] ?? "/";
    if (url === "/" || url === "/healthz") {
      const readiness = opts?.getReadiness?.() ?? { ok: true, body: { ok: true } };
      const status = readiness.ok ? 200 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(readiness.body));
      return;
    }
    if (url === "/ready") {
      const readiness = opts?.getReadiness?.() ?? { ok: true, body: { ok: true } };
      const status = readiness.ok ? 200 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(readiness.body));
      return;
    }
    if (url === "/metrics") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(workerMetrics.snapshot()));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
  server.listen(port, () => {
    logger.info({ port }, "Worker health server started");
  });
  return server;
}
