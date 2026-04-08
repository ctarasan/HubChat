import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ProcessInboundMessageUseCase } from "../application/usecases/processInboundMessage.js";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { DbQueue } from "../infrastructure/adapters/queue/dbQueue.js";
import { LineAdapter } from "../infrastructure/adapters/channels/lineAdapter.js";
import { SupabaseActivityLogRepository } from "../infrastructure/adapters/repositories/supabaseActivityLogRepository.js";
import { SupabaseConversationRepository } from "../infrastructure/adapters/repositories/supabaseConversationRepository.js";
import { SupabaseLeadRepository } from "../infrastructure/adapters/repositories/supabaseLeadRepository.js";
import { SupabaseMessageRepository } from "../infrastructure/adapters/repositories/supabaseMessageRepository.js";
import { NoopIdempotency } from "../infrastructure/adapters/runtime/noopIdempotency.js";
import { NoopRateLimiter } from "../infrastructure/adapters/runtime/noopRateLimiter.js";
import { InboundWorker } from "./inboundWorker.js";
import { OutboundWorker } from "./outboundWorker.js";

const env = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
    LINE_CHANNEL_SECRET: z.string().min(1)
  })
  .parse(process.env);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const queue = new DbQueue(supabase);
const leadRepository = new SupabaseLeadRepository(supabase);
const conversationRepository = new SupabaseConversationRepository(supabase);
const messageRepository = new SupabaseMessageRepository(supabase);
const activityLogRepository = new SupabaseActivityLogRepository(supabase);
const rateLimiter = new NoopRateLimiter();
const idempotency = new NoopIdempotency();

const channelAdapter = new LineAdapter({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: env.LINE_CHANNEL_SECRET
});

const outboundUseCase = new SendOutboundMessageUseCase({
  channelAdapter,
  messageRepository,
  activityLogRepository,
  rateLimiter,
  idempotency
});

const inboundUseCase = new ProcessInboundMessageUseCase({
  leadRepository,
  conversationRepository,
  messageRepository,
  activityLogRepository
});

const inboundWorker = new InboundWorker(queue, inboundUseCase);
const outboundWorker = new OutboundWorker(queue, outboundUseCase);

Promise.all([inboundWorker.runForever(), outboundWorker.runForever()]).catch((err) => {
  console.error(err);
  process.exit(1);
});
