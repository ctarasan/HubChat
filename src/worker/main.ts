import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SendOutboundMessageUseCase } from "../application/usecases/sendOutboundMessage.js";
import { DbQueue } from "../infrastructure/adapters/queue/dbQueue.js";
import { LineAdapter } from "../infrastructure/adapters/channels/lineAdapter.js";
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

const channelAdapter = new LineAdapter({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: env.LINE_CHANNEL_SECRET
});

const useCase = new SendOutboundMessageUseCase({
  channelAdapter,
  messageRepository: {
    async markSent(_messageId) {},
    async markFailed(_messageId, _reason) {},
    async create(_data) {
      throw new Error("Not implemented in worker bootstrap");
    }
  },
  activityLogRepository: {
    async create(_input) {}
  },
  rateLimiter: {
    async checkOrThrow(_tenantId, _channel) {}
  },
  idempotency: {
    async hasProcessed(_scope, _key) {
      return false;
    },
    async markProcessed(_scope, _key) {}
  }
});

const worker = new OutboundWorker(queue, useCase);
worker.runForever().catch((err) => {
  console.error(err);
  process.exit(1);
});
