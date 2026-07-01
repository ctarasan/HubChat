import "./registerProcessHandlers.js";
import { createClient } from "@supabase/supabase-js";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";
import { ProcessFacebookMessengerEchoUseCase } from "../application/usecases/processFacebookMessengerEcho.js";
import { createInstagramOutboundAdapterResolver } from "../application/instagramOutbound/createInstagramOutboundAdapterResolver.js";
import { createInstagramOAuthImageDeliveryService } from "../application/instagramOAuth/instagramOAuthImageDelivery.js";
import { createInstagramOAuthTextDeliveryService } from "../application/instagramOAuth/instagramOAuthTextDelivery.js";
import { createLineOutboundAdapterResolver } from "../application/lineOutbound/createLineOutboundAdapterResolver.js";
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
import { enqueueProfileAvatarCache } from "../application/profileAvatar/enqueueProfileAvatarCache.js";
import { ProcessProfileAvatarCacheUseCase } from "../application/profileAvatar/processProfileAvatarCache.js";
import { ProfileAvatarCacheService } from "../infrastructure/media/profileAvatarCacheService.js";
import { SupabaseProfileAvatarRepository } from "../infrastructure/adapters/repositories/supabaseProfileAvatarRepository.js";
import { InboundWorker } from "./inboundWorker.js";
import { ProfileAvatarCacheWorker } from "./profileAvatarCacheWorker.js";
import { OutboxRelayWorker } from "./outboxRelayWorker.js";
import { OutboundWorker } from "./outboundWorker.js";
import { WorkerObservability } from "./workerObservability.js";
import { startWorkerHealthServer } from "./workerHealthServer.js";
import { workerMetrics } from "./workerMetrics.js";
import { InboundMediaService } from "../infrastructure/media/inboundMediaService.js";
import { buildInstagramOutboundConfig } from "./instagramOutboundConfig.js";
import { parseFacebookRuntimeConfigMode } from "../lib/facebookOutboundRuntimeConfig.js";
import { parseInstagramRuntimeConfigMode } from "../lib/instagramOutboundRuntimeConfig.js";
import { parseLineRuntimeConfigMode } from "../lib/lineOutboundRuntimeConfig.js";
import { parseWorkerEnv, resolveWorkerHealthListenPort, type WorkerEnv } from "../lib/workerEnv.js";
import { SupabaseChannelSettingRepository } from "../infrastructure/adapters/repositories/supabaseChannelSettingRepository.js";
import { isChannelConnectResolverEnabled } from "../lib/channelConnectRuntimeMode.js";
import { isMetaPageCredentialEnabled } from "../lib/metaPageCredentialRuntimeFlags.js";
import { resolveChannelCredentialEncryptionKey } from "../lib/channelCredentialEncryption.js";
import { createWorkerChannelConnectionRepository } from "./workerChannelConnectionComposition.js";
import { createWorkerMetaPageCredentialRepository } from "./workerMetaPageCredentialComposition.js";
import { SupabaseMarketingEventRepository } from "../infrastructure/adapters/repositories/supabaseMarketingEventRepository.js";
import { SupabaseInstagramOAuthCredentialRepository } from "../infrastructure/adapters/repositories/supabaseInstagramOAuthCredentialRepository.js";
import { fetchClaimableOutboundQueueJobCount, validateWorkerSupabase } from "../lib/validateWorkerSupabase.js";
import { serializeError } from "../lib/serializeError.js";
import { registerWorkerLoop } from "./workerLoopLiveness.js";
import { superviseWorkerLoop } from "./workerLoopSupervisor.js";
import { buildWorkerHealthReadiness } from "./workerHealthReadiness.js";
import { emitWorkerStderrJson, emitWorkerStdoutJson } from "./workerJsonConsole.js";
import pino from "pino";
import { createWorkerFacebookOutboundAdapterResolver } from "./workerOutboundComposition.js";
import { markWorkerEnvParsedOk, markWorkerSupabaseSanityOk } from "./workerBootGate.js";
import { registerWorkerShutdownHandlers } from "./workerShutdownCoordinator.js";
import { getOutboundActiveJobCount } from "./workerLoopLiveness.js";

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

function supabaseHostFromEnv(env: WorkerEnv): string {
  try {
    return new URL(env.SUPABASE_URL).host;
  } catch {
    return "invalid-url";
  }
}

/** Plain JSON lines for Railway; `phase: env_loaded` runs before DB validation so logs appear even if validate hangs. */
function emitWorkerStartup(env: WorkerEnv, phase: "env_loaded" | "ready", claimableOutboundPendingApprox: number | null): void {
  const npmLifecycle = process.env.npm_lifecycle_event ?? null;
  const startCommandHint = npmLifecycle ? `npm run ${npmLifecycle}` : process.argv.slice(0, 3).join(" ");
  emitWorkerStdoutJson({
    event: "worker_startup",
    phase,
    appVersion: process.env.npm_package_version ?? "unknown",
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitBranch: process.env.RAILWAY_GIT_BRANCH ?? null,
    gitRepo: process.env.RAILWAY_GIT_REPO_NAME ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    npmLifecycleEvent: npmLifecycle,
    startCommandHint,
    enabledWorkerLoops: ["observability", "outboxRelay", "inbound", "outbound"],
    loops: ["observability", "outboxRelay", "inbound", "outbound"],
    queueTopics: ["message.inbound.normalized", "message.outbound.requested"],
    outboundTopic: "message.outbound.requested",
    outboxRelayDescription: "outbox_events -> queue_jobs (all topics)",
    pollIntervals: {
      workerPollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
      observabilityPollMs: env.WORKER_OBSERVABILITY_POLL_MS
    },
    batchSizes: {
      inbound: env.WORKER_INBOUND_BATCH_SIZE,
      outbound: env.WORKER_OUTBOUND_BATCH_SIZE,
      outbox: env.WORKER_OUTBOX_BATCH_SIZE
    },
    concurrencies: {
      inbound: env.WORKER_INBOUND_CONCURRENCY,
      outbound: env.WORKER_OUTBOUND_CONCURRENCY,
      outbox: env.WORKER_OUTBOX_CONCURRENCY
    },
    workerInboundBatchSize: env.WORKER_INBOUND_BATCH_SIZE,
    workerInboundConcurrency: env.WORKER_INBOUND_CONCURRENCY,
    workerOutboundBatchSize: env.WORKER_OUTBOUND_BATCH_SIZE,
    workerOutboundConcurrency: env.WORKER_OUTBOUND_CONCURRENCY,
    workerOutboxBatchSize: env.WORKER_OUTBOX_BATCH_SIZE,
    workerOutboxConcurrency: env.WORKER_OUTBOX_CONCURRENCY,
    workerQueueClaimTimeoutMs: env.WORKER_QUEUE_CLAIM_TIMEOUT_MS,
    workerOutboundRunOnceTimeoutMs: env.WORKER_OUTBOUND_RUN_ONCE_TIMEOUT_MS,
    workerLoopPollLogIntervalMs: env.WORKER_LOOP_POLL_LOG_INTERVAL_MS,
    workerLoopHeartbeatMs: env.WORKER_LOOP_HEARTBEAT_MS,
    claimableOutboundPendingApprox,
    supabaseHost: supabaseHostFromEnv(env),
    pid: process.pid
  });
}

async function run(): Promise<void> {
  const env = parseWorkerEnv(process.env);
  markWorkerEnvParsedOk();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  emitWorkerStartup(env, "env_loaded", null);

  await validateWorkerSupabase(supabase, {
    queueClaimProcessingTimeoutSeconds: env.WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS,
    outboxProcessingTimeoutSeconds: env.WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS
  });
  markWorkerSupabaseSanityOk();

  const claimableOutboundApprox = await fetchClaimableOutboundQueueJobCount(supabase).catch((err: unknown) => {
    emitWorkerStderrJson({
      event: "worker_startup_claimable_count_failed",
      error: serializeError(err)
    });
    return null;
  });

  emitWorkerStdoutJson({
    event: "worker_startup_queue_snapshot",
    claimableOutboundCount: claimableOutboundApprox,
    outboundTopic: "message.outbound.requested"
  });

  emitWorkerStartup(env, "ready", claimableOutboundApprox);

  const queue = new DbQueue(supabase, env.WORKER_QUEUE_CLAIM_PROCESSING_TIMEOUT_SECONDS);
  const outboxRepository = new SupabaseOutboxRepository(supabase, env.WORKER_OUTBOX_PROCESSING_TIMEOUT_SECONDS);
  const leadRepository = new SupabaseLeadRepository(supabase);
  const conversationRepository = new SupabaseConversationRepository(supabase);
  const messageRepository = new SupabaseMessageRepository(supabase);
  const activityLogRepository = new SupabaseActivityLogRepository(supabase);
  const marketingEventRepository = new SupabaseMarketingEventRepository(supabase);
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

  const lineRuntimeConfigMode = parseLineRuntimeConfigMode(process.env.HUBCHAT_LINE_RUNTIME_CONFIG_MODE);
  const facebookRuntimeConfigMode = parseFacebookRuntimeConfigMode(
    process.env.HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE
  );
  const instagramRuntimeConfigMode = parseInstagramRuntimeConfigMode(
    process.env.HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE
  );
  console.info("[worker] LINE outbound runtime config mode", { lineRuntimeConfigMode });
  console.info("[worker] Facebook outbound runtime config mode", { facebookRuntimeConfigMode });
  console.info("[worker] Instagram outbound runtime config mode", { instagramRuntimeConfigMode });

  const channelAdapterRegistry = new ChannelAdapterRegistry();
  if (env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET) {
    channelAdapterRegistry.register(
      new LineAdapter({
        channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
        channelSecret: env.LINE_CHANNEL_SECRET
      })
    );
  }

  const channelSettingRepository = new SupabaseChannelSettingRepository(supabase);
  const channelConnectResolverEnabled = isChannelConnectResolverEnabled(process.env);
  const metaPageCredentialEnabled = isMetaPageCredentialEnabled(process.env);
  const workerEncryptionKey = resolveChannelCredentialEncryptionKey({ env });
  const channelConnectionRepository = createWorkerChannelConnectionRepository(supabase, env);
  const metaPageCredentialRepository = metaPageCredentialEnabled
    ? createWorkerMetaPageCredentialRepository(supabase, env)
    : undefined;
  const instagramOAuthCredentialRepository = new SupabaseInstagramOAuthCredentialRepository(supabase);
  const instagramOAuthTextDelivery = createInstagramOAuthTextDeliveryService({
    channelConnectionRepository,
    instagramOAuthCredentialRepository,
    env: process.env
  });
  const instagramOAuthImageDelivery = createInstagramOAuthImageDeliveryService({
    channelConnectionRepository,
    instagramOAuthCredentialRepository,
    env: process.env
  });
  const channelConnectionRepositoryForOutbound = channelConnectResolverEnabled
    ? channelConnectionRepository
    : undefined;
  console.info("[worker] Channel Connect outbound resolver", { channelConnectResolverEnabled });
  console.info("[worker] Meta Page credential runtime resolver", { metaPageCredentialEnabled });
  console.info("[worker] Channel credential encryption key", {
    encryptionKeyConfigured: workerEncryptionKey.status === "configured"
  });
  const outboundResolverLogger = pino({ name: "worker-outbound-resolver", level: "info" });
  const lineOutboundAdapterResolver =
    lineRuntimeConfigMode === "ENV_ONLY"
      ? undefined
      : createLineOutboundAdapterResolver({
          mode: lineRuntimeConfigMode,
          env,
          channelSettingRepository,
          channelConnectionRepository: channelConnectionRepositoryForOutbound,
          resolverEnabled: channelConnectResolverEnabled,
          logger: outboundResolverLogger
        });
  const facebookOutboundAdapterResolver =
    facebookRuntimeConfigMode === "ENV_ONLY"
      ? undefined
      : createWorkerFacebookOutboundAdapterResolver({
          mode: facebookRuntimeConfigMode,
          env,
          channelSettingRepository,
          channelConnectionRepository: channelConnectionRepositoryForOutbound,
          metaPageCredentialRepository,
          resolverEnabled: channelConnectResolverEnabled,
          metaPageCredentialEnabled,
          logger: outboundResolverLogger
        });
  const instagramOutboundAdapterResolver =
    instagramRuntimeConfigMode === "ENV_ONLY"
      ? undefined
      : createInstagramOutboundAdapterResolver({
          mode: instagramRuntimeConfigMode,
          env,
          channelSettingRepository,
          channelConnectionRepository: channelConnectionRepositoryForOutbound,
          resolverEnabled: channelConnectResolverEnabled,
          logger: outboundResolverLogger
        });
  if (env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    const deployCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
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
    console.warn(
      "[worker] No Page token for Instagram send: set FACEBOOK_PAGE_ACCESS_TOKEN (preferred) or INSTAGRAM_ACCESS_TOKEN (must be Page token EA…); outbound INSTAGRAM jobs will fail with adapter not found"
    );
  }

  const outboundUseCase = new SendOutboundMessageUseCase({
    channelAdapterRegistry,
    lineOutboundAdapterResolver,
    facebookOutboundAdapterResolver,
    instagramOutboundAdapterResolver,
    instagramOAuthTextDelivery,
    instagramOAuthImageDelivery,
    workerEnv: process.env,
    conversationRepository,
    leadRepository,
    messageRepository,
    activityLogRepository,
    rateLimiter,
    idempotency,
    marketingEventRepository,
    onProviderLatencyMs: ({ latencyMs }) => {
      workerMetrics.observeProviderLatency(latencyMs);
    }
  });

  const inboundMediaService = new InboundMediaService(supabase, {
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    signedUrlTtlSec: 60 * 60 * 24 * 7
  });

  const profileAvatarRepository = new SupabaseProfileAvatarRepository(supabase);
  const profileAvatarCacheService = new ProfileAvatarCacheService(supabase);
  const profileAvatarCacheUseCase = new ProcessProfileAvatarCacheUseCase(
    profileAvatarRepository,
    profileAvatarCacheService
  );

  const inboundUseCase = new ProcessInboundMessageUseCase({
    leadRepository,
    conversationRepository,
    messageRepository,
    activityLogRepository,
    contactRepository,
    channelAccountRepository,
    channelConnectionRepository,
    inboundMediaService,
    marketingEventRepository,
    enqueueProfileAvatarCache: (input) => enqueueProfileAvatarCache(queue, input)
  });
  const facebookEchoUseCase = new ProcessFacebookMessengerEchoUseCase({
    conversationRepository,
    messageRepository,
    activityLogRepository
  });

  const profileAvatarCacheWorker = new ProfileAvatarCacheWorker(queue, profileAvatarCacheUseCase, {
    batchSize: 10,
    concurrency: 4,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    claimTimeoutMs: env.WORKER_QUEUE_CLAIM_TIMEOUT_MS,
    pollLogIntervalMs: env.WORKER_LOOP_POLL_LOG_INTERVAL_MS,
    heartbeatMs: env.WORKER_LOOP_HEARTBEAT_MS
  });
  const inboundWorker = new InboundWorker(queue, inboundUseCase, facebookEchoUseCase, {
    batchSize: env.WORKER_INBOUND_BATCH_SIZE,
    concurrency: env.WORKER_INBOUND_CONCURRENCY,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    claimTimeoutMs: env.WORKER_QUEUE_CLAIM_TIMEOUT_MS,
    pollLogIntervalMs: env.WORKER_LOOP_POLL_LOG_INTERVAL_MS,
    heartbeatMs: env.WORKER_LOOP_HEARTBEAT_MS
  });
  const outboxRelayWorker = new OutboxRelayWorker(outboxRepository, queue, {
    batchSize: env.WORKER_OUTBOX_BATCH_SIZE,
    concurrency: env.WORKER_OUTBOX_CONCURRENCY,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    claimTimeoutMs: env.WORKER_QUEUE_CLAIM_TIMEOUT_MS,
    pollLogIntervalMs: env.WORKER_LOOP_POLL_LOG_INTERVAL_MS,
    heartbeatMs: env.WORKER_LOOP_HEARTBEAT_MS
  });
  const observability = new WorkerObservability(supabase);
  const outboundWorker = new OutboundWorker(queue, outboundUseCase, {
    batchSize: env.WORKER_OUTBOUND_BATCH_SIZE,
    concurrency: env.WORKER_OUTBOUND_CONCURRENCY,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    claimTimeoutMs: env.WORKER_QUEUE_CLAIM_TIMEOUT_MS,
    runOnceTimeoutMs: env.WORKER_OUTBOUND_RUN_ONCE_TIMEOUT_MS,
    pollLogIntervalMs: env.WORKER_LOOP_POLL_LOG_INTERVAL_MS,
    heartbeatMs: env.WORKER_LOOP_HEARTBEAT_MS,
    messageRepository
  });

  registerWorkerLoop("observability", env.WORKER_OBSERVABILITY_POLL_MS);
  registerWorkerLoop("outboxRelay", env.WORKER_POLL_INTERVAL_MS);
  registerWorkerLoop("inbound", env.WORKER_POLL_INTERVAL_MS);
  registerWorkerLoop("profileAvatarCache", env.WORKER_POLL_INTERVAL_MS);
  registerWorkerLoop("outbound", env.WORKER_POLL_INTERVAL_MS);

  const healthListenPort = resolveWorkerHealthListenPort(env);
  startWorkerHealthServer(healthListenPort, { getReadiness: buildWorkerHealthReadiness });

  superviseWorkerLoop({
    loopKey: "observability",
    label: "observability",
    run: () => observability.runForever(env.WORKER_OBSERVABILITY_POLL_MS, env.WORKER_LOOP_POLL_LOG_INTERVAL_MS)
  });
  superviseWorkerLoop({
    loopKey: "outboxRelay",
    label: "outboxRelay",
    run: () => outboxRelayWorker.runForever()
  });
  superviseWorkerLoop({
    loopKey: "inbound",
    label: "inbound",
    run: () => inboundWorker.runForever()
  });
  superviseWorkerLoop({
    loopKey: "profileAvatarCache",
    label: "profileAvatarCache",
    run: () => profileAvatarCacheWorker.runForever()
  });
  superviseWorkerLoop({
    loopKey: "outbound",
    label: "outbound",
    run: () => outboundWorker.runForever()
  });

  registerWorkerShutdownHandlers({
    graceMs: env.WORKER_SHUTDOWN_GRACE_MS,
    getOutboundActiveCount: getOutboundActiveJobCount
  });

  await new Promise<void>(() => {
    // Never resolve: supervised loops and the health server keep the process alive.
  });
}

run().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "worker_boot_failed",
      pid: process.pid,
      error: serializeError(err)
    })
  );
  process.exit(1);
});
