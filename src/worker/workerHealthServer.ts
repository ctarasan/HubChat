import http from "node:http";
import pino from "pino";
import { workerMetrics } from "./workerMetrics.js";

const logger = pino({ name: "worker-health-server" });

/** Bind all interfaces so Railway / Docker health probes can reach the server. */
export const WORKER_HEALTH_SERVER_HOST = "0.0.0.0" as const;

export interface WorkerHealthReadiness {
  ok: boolean;
  body: Record<string, unknown>;
}

export function startWorkerHealthServer(
  port: number,
  opts?: { getReadiness?: () => WorkerHealthReadiness; host?: string }
): http.Server {
  const host = opts?.host ?? WORKER_HEALTH_SERVER_HOST;
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
  server.listen(port, host, () => {
    const started = {
      event: "worker_health_server_started",
      port,
      host,
      readyPath: "/ready"
    };
    console.log(JSON.stringify(started));
    logger.info(started, "worker_health_server_started");
  });
  return server;
}
