import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { ChannelAdapterRegistry } from "../infrastructure/adapters/channels/adapterRegistry.js";
import { FacebookAdapter } from "../infrastructure/adapters/channels/facebookAdapter.js";
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

const env = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).optional(),
    LINE_CHANNEL_SECRET: z.string().min(1).optional(),
    FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(200),
    WORKER_INBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
    WORKER_INBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(8),
    WORKER_OUTBOUND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(15),
    WORKER_OUTBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(5),
    WORKER_OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
    WORKER_OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(10),
    WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(120),
    WORKER_OBSERVABILITY_POLL_MS: z.coerce.number().int().min(1000).default(5000),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    OUTBOUND_RATE_LIMIT_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).default(120),
    OUTBOUND_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
    IDEMPOTENCY_COMPLETED_TTL_SECONDS: z.coerce.number().int().min(300).default(86400)
  })
  .parse(process.env);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const queue = new DbQueue(supabase);
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
if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET) {
  channelAdapterRegistry.register(
    new LineAdapter({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      channelSecret: env.LINE_CHANNEL_SECRET
    })
  );
}
if (env.FACEBOOK_PAGE_ACCESS_TOKEN) {
  channelAdapterRegistry.register(
    new FacebookAdapter({
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN
    })
  );
} else {
  console.warn("[worker] FACEBOOK_PAGE_ACCESS_TOKEN is not set; outbound FACEBOOK jobs will fail with adapter not found");
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

const inboundUseCase = new ProcessInboundMessageUseCase({
  leadRepository,
  conversationRepository,
  messageRepository,
  activityLogRepository,
  contactRepository,
  channelAccountRepository
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

if (env.WORKER_HEALTH_PORT) {
  startWorkerHealthServer(env.WORKER_HEALTH_PORT);
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
