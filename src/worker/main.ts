import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { ChannelAdapterRegistry } from "../infrastructure/adapters/channels/adapterRegistry.js";
import { FacebookAdapter } from "../infrastructure/adapters/channels/facebookAdapter.js";
import { InstagramAdapter } from "../infrastructure/adapters/channels/instagramAdapter.js";
import { DbQueue } from "../infrastructure/adapters/queue/dbQueue.js";
import { LineAdapter } from "../infrastructure/adapters/channels/lineAdapter.js";
import { SupabaseActivityLogRepository } from "../infrastructure/adapters/repositories/supabaseActivityLogRepository.js";
import { SupabaseChannelAccountRepository } from "../infrastructure/adapters/repositories/supabaseChannelAccountRepository.js";
import { SupabaseConversationRepository } from "../infrastructure/adapters/repositories/supabaseConversationRepository.js";
import { SupabaseContactRepository } from "../infrastructure/adapters/repositories/supabaseContactRepository.js";
import { SupabaseLeadRepository } from "../infrastructure/adapters/repositories/supabaseLeadRepository.js";
import { SupabaseMessageRepository } from "../infrastructure/adapters/repositories/supabaseMessageRepository.js";
import { SupabaseOutboxRepository } from "../infrastructure/adapters/repositories/supabaseOutboxRepository.js";
import { SupabaseIdempotency } from "../infrastructure/adapters/runtime/supabaseIdempotency.js";
import { SupabaseRateLimiter } from "../infrastructure/adapters/runtime/supabaseRateLimiter.js";
import { InboundWorker } from "./inboundWorker.js";
import { OutboxRelayWorker } from "./outboxRelayWorker.js";
import { OutboundWorker } from "./outboundWorker.js";
import { WorkerObservability } from "./workerObservability.js";
import { startWorkerHealthServer } from "./workerHealthServer.js";
import { workerMetrics } from "./workerMetrics.js";
import { InboundMediaService } from "../infrastructure/media/inboundMediaService.js";
import { buildInstagramOutboundConfig } from "./instagramOutboundConfig.js";

const env = z
  .object({
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
    WORKER_INBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
    WORKER_INBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(8),
    WORKER_OUTBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(15),
    WORKER_OUTBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(5),
    WORKER_OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
    WORKER_OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(10),
    WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(120),
    WORKER_OBSERVABILITY_POLL_MS: z.coerce.number().int().min(1000).default(5000),
    /** Explicit health/metrics port (local or override). */
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    /**
     * Railway and similar hosts set PORT and expect the process to listen for health checks.
     * We bind the worker health server to WORKER_HEALTH_PORT ?? PORT.
     */
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    OUTBOUND_RATE_LIMIT_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).default(120),
    OUTBOUND_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
    IDEMPOTENCY_COMPLETED_TTL_SECONDS: z.coerce.number().int().min(300).default(86400)
  })
  .parse(process.env);

function tokenFingerprintLast8(value: string | undefined): string | null {
  const token = value?.trim();
  if (!token) return null;
  return token.slice(-8);
}

function tokenLength(value: string | undefined): number {
  return value?.trim().length ?? 0;
}

function normalizeGraphVersion(value: string | undefined): string {
  const raw = (value ?? "v25.0").trim();
  if (!raw) return "v25.0";
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const queue = new DbQueue(supabase, env.WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS);
const outboxRepository = new SupabaseOutboxRepository(supabase, env.WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS);
const leadRepository = new SupabaseLeadRepository(supabase);
const conversationRepository = new SupabaseConversationRepository(supabase);
const messageRepository = new SupabaseMessageRepository(supabase);
const activityLogRepository = new SupabaseActivityLogRepository(supabase);
const contactRepository = new SupabaseContactRepository(supabase);
const channelAccountRepository = new SupabaseChannelAccountRepository(supabase);
const rateLimiter = new SupabaseRateLimiter(supabase, {
  requestsPerWindow: env.OUTBOUND_RATE_LIMIT_REQUESTS_PER_WINDOW,
  windowSeconds: env.OUTBOUND_RATE_LIMIT_WINDOW_SECONDS
});
const idempotency = new SupabaseIdempotency(supabase, {
  processingTtlSeconds: env.IDEMPOTENCY_PROCESSING_TTL_SECONDS,
  completedTtlSeconds: env.IDEMPOTENCY_COMPLETED_TTL_SECONDS
});

const channelAdapterRegistry = new ChannelAdapterRegistry();
console.info("[worker] deployment git info", {
  railwayGitCommitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
  railwayGitBranch: process.env.RAILWAY_GIT_BRANCH ?? null,
  railwayGitRepoName: process.env.RAILWAY_GIT_REPO_NAME ?? null,
  nodeEnv: process.env.NODE_ENV ?? null,
  metaGraphVersion: process.env.META_GRAPH_VERSION ?? null
});
if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET) {
  channelAdapterRegistry.register(
    new LineAdapter({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: env.LINE_CHANNEL_SECRET
    })
  );
}
if (env.FACEBOOK_PAGE_ACCESS_TOKEN) {
  const deployCommitSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;
  const graphVersion = normalizeGraphVersion(env.META_GRAPH_VERSION ?? env.FACEBOOK_GRAPH_VERSION);
  console.info("[worker] Facebook runtime config", {
    facebookPageId: env.FACEBOOK_PAGE_ID ?? null,
    facebookTokenFingerprintLast8: tokenFingerprintLast8(env.FACEBOOK_PAGE_ACCESS_TOKEN),
    facebookTokenLength: tokenLength(env.FACEBOOK_PAGE_ACCESS_TOKEN),
    graphVersion,
    commitSha: deployCommitSha
  });
  channelAdapterRegistry.register(
    new FacebookAdapter({
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      graphVersion
    })
  );
} else {
  console.warn("[worker] FACEBOOK_PAGE_ACCESS_TOKEN is not set; outbound FACEBOOK jobs will fail with adapter not found");
}
const instagramOutboundConfig = buildInstagramOutboundConfig({
  FACEBOOK_PAGE_ACCESS_TOKEN: env.FACEBOOK_PAGE_ACCESS_TOKEN,
  INSTAGRAM_ACCESS_TOKEN: env.INSTAGRAM_ACCESS_TOKEN,
  FACEBOOK_PAGE_ID: env.FACEBOOK_PAGE_ID,
  INSTAGRAM_PAGE_ID: env.INSTAGRAM_PAGE_ID,
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION,
  FACEBOOK_GRAPH_VERSION: process.env.FACEBOOK_GRAPH_VERSION,
  INSTAGRAM_ACCOUNT_ID: env.INSTAGRAM_ACCOUNT_ID
});
console.info("[worker] Instagram outbound startup config", {
  instagramOutboundEnabled: instagramOutboundConfig.instagramOutboundEnabled,
  hasInstagramAccessToken: instagramOutboundConfig.hasInstagramAccessToken,
  instagramGraphPageId: instagramOutboundConfig.instagramGraphPageId,
  instagramTokenSource: instagramOutboundConfig.instagramTokenSource,
  instagramTokenLength: instagramOutboundConfig.instagramTokenLength,
  instagramTokenSha256Prefix12: instagramOutboundConfig.instagramTokenSha256Prefix12
});

if (instagramOutboundConfig.accessToken) {
  channelAdapterRegistry.register(
    new InstagramAdapter({
      accessToken: instagramOutboundConfig.accessToken,
      graphVersion: normalizeGraphVersion(instagramOutboundConfig.graphVersion),
      businessAccountId: instagramOutboundConfig.businessAccountId,
      ...(instagramOutboundConfig.pageId ? { pageId: instagramOutboundConfig.pageId } : {})
    })
  );
} else {
  console.warn("[worker] No Page token for Instagram send: set FACEBOOK_PAGE_ACCESS_TOKEN (preferred) or INSTAGRAM_ACCESS_TOKEN (must be Page token EA…); outbound INSTAGRAM jobs will fail with adapter not found");
}

const outboundUseCase = new SendOutboundMessageUseCase({
  channelAdapterRegistry,
  conversationRepository,
  messageRepository,
  activityLogRepository,
  rateLimiter,
  idempotency,
  onProviderLatencyMs: ({ latencyMs }) => {
    workerMetrics.observeProviderLatency(latencyMs);
  }
});

const inboundMediaService = new InboundMediaService(supabase, {
  lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  signedUrlTtlSec: 60 * 60 * 24 * 7
});

const inboundUseCase = new ProcessInboundMessageUseCase({
  leadRepository,
  conversationRepository,
  messageRepository,
  activityLogRepository,
  contactRepository,
  channelAccountRepository,
  inboundMediaService
});

const inboundWorker = new InboundWorker(queue, inboundUseCase, {
  batchSize: env.WORKER_INBOUND_BATCH_SIZE,
  concurrency: env.WORKER_INBOUND_CONCURRENCY,
  pollIntervalMs: env.WORKER_POLL_INTERVAL_MS
});
const outboxRelayWorker = new OutboxRelayWorker(outboxRepository, queue, {
  batchSize: env.WORKER_OUTBOX_BATCH_SIZE,
  concurrency: env.WORKER_OUTBOX_CONCURRENCY,
  pollIntervalMs: env.WORKER_POLL_INTERVAL_MS
});
const observability = new WorkerObservability(supabase);
const outboundWorker = new OutboundWorker(queue, outboundUseCase, {
  batchSize: env.WORKER_OUTBOUND_BATCH_SIZE,
  concurrency: env.WORKER_OUTBOUND_CONCURRENCY,
  pollIntervalMs: env.WORKER_POLL_INTERVAL_MS
});

const healthListenPort = env.WORKER_HEALTH_PORT ?? env.PORT;
if (typeof healthListenPort === "number") {
  startWorkerHealthServer(healthListenPort);
}

Promise.all([
  observability.runForever(env.WORKER_OBSERVABILITY_POLL_MS),
  outboxRelayWorker.runForever(),
  inboundWorker.runForever(),
  outboundWorker.runForever()
]).catch((err) => {
  console.error(err);
  process.exit(1);
});
