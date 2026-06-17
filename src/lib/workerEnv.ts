import { z } from "zod";

export const workerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).optional(),
  LINE_CHANNEL_SECRET: z.string().min(1).optional(),
  FACEBOOK_PAGE_ID: z.string().min(1).optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  FACEBOOK_GRAPH_VERSION: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().min(1).optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_PAGE_ID: z.string().min(1).optional(),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().min(1).optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(200),
  /** Applies to queue claim RPC (inbound/outbound) and outbox claim RPC. */
  WORKER_QUEUE_CLAIM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(45_000),
  /** Wall-clock cap for one outbound poll cycle (claim + fan-out); underlying work may still complete afterward. */
  WORKER_OUTBOUND_RUN_ONCE_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600_000).default(60_000),
  /** Minimum spacing between `worker_loop_poll` structured logs per loop. */
  WORKER_LOOP_POLL_LOG_INTERVAL_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  /** Heartbeat interval while a worker batch is in flight (updates liveness during long sends). */
  WORKER_LOOP_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  WORKER_INBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  WORKER_INBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(8),
  WORKER_OUTBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(15),
  WORKER_OUTBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(5),
  WORKER_OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
  WORKER_OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(10),
  WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(120),
  WORKER_OBSERVABILITY_POLL_MS: z.coerce.number().int().min(1000).default(5000),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  OUTBOUND_RATE_LIMIT_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).default(120),
  OUTBOUND_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
  IDEMPOTENCY_COMPLETED_TTL_SECONDS: z.coerce.number().int().min(300).default(86400),
  /** AES key material for channel_credentials decrypt (Channel Connect / OAuth). */
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
  /** Max wait for outbound in-flight jobs after SIGTERM/SIGINT before exit(1). */
  WORKER_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).max(600_000).default(25_000)
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Local dev only when `PORT` / `WORKER_HEALTH_PORT` are unset (Railway always sets `PORT`). */
export const WORKER_LOCAL_DEFAULT_HEALTH_PORT = 3000;

/**
 * Port for the worker HTTP health server.
 * Order: `WORKER_HEALTH_PORT` → `PORT` (from parsed env) → raw `process.env.PORT` / `WORKER_HEALTH_PORT` → {@link WORKER_LOCAL_DEFAULT_HEALTH_PORT}.
 */
export function resolveWorkerHealthListenPort(env: WorkerEnv): number {
  if (typeof env.WORKER_HEALTH_PORT === "number" && env.WORKER_HEALTH_PORT >= 1 && env.WORKER_HEALTH_PORT <= 65535) {
    return env.WORKER_HEALTH_PORT;
  }
  if (typeof env.PORT === "number" && env.PORT >= 1 && env.PORT <= 65535) {
    return env.PORT;
  }
  const raw = process.env.PORT ?? process.env.WORKER_HEALTH_PORT;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(String(raw).trim());
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  }
  return WORKER_LOCAL_DEFAULT_HEALTH_PORT;
}

/**
 * Validates worker environment. On failure, throws with only variable keys (no secret values).
 */
export function parseWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);
  if (result.success) return result.data;

  const keys = new Set<string>();
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") keys.add(key);
    else keys.add(issue.path.join("."));
  }
  const sorted = [...keys].sort();
  throw new Error(`Worker startup failed: missing or invalid required environment variables: ${sorted.join(", ")}`);
}
