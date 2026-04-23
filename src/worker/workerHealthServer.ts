import http from "node:http";
import pino from "pino";
import { workerMetrics } from "./workerMetrics.js";

const logger = pino({ name: "worker-health-server" });

export function startWorkerHealthServer(port: number): void {
  const server = http.createServer((_req, res) => {
    const url = _req.url ?? "/";
    if (url === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
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
}
