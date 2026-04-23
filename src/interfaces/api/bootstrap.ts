import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";
import { DbQueue } from "../../infrastructure/adapters/queue/dbQueue.js";
import { SupabaseLeadRepository } from "../../infrastructure/adapters/repositories/supabaseLeadRepository.js";
import { SupabaseConversationRepository } from "../../infrastructure/adapters/repositories/supabaseConversationRepository.js";
import { SupabaseMessageRepository } from "../../infrastructure/adapters/repositories/supabaseMessageRepository.js";
import { SupabaseActivityLogRepository } from "../../infrastructure/adapters/repositories/supabaseActivityLogRepository.js";
import { SupabaseWebhookEventRepository } from "../../infrastructure/adapters/repositories/supabaseWebhookEventRepository.js";
import { SupabaseContactRepository } from "../../infrastructure/adapters/repositories/supabaseContactRepository.js";
import { SupabaseChannelAccountRepository } from "../../infrastructure/adapters/repositories/supabaseChannelAccountRepository.js";
import { SupabaseOutboundCommandRepository } from "../../infrastructure/adapters/repositories/supabaseOutboundCommandRepository.js";
import { SupabaseOutboxRepository } from "../../infrastructure/adapters/repositories/supabaseOutboxRepository.js";

export function apiBootstrap() {
  const supabase = createServiceSupabaseClient();
  return {
    supabase,
    queue: new DbQueue(supabase),
    leadRepository: new SupabaseLeadRepository(supabase),
    conversationRepository: new SupabaseConversationRepository(supabase),
    messageRepository: new SupabaseMessageRepository(supabase),
    activityLogRepository: new SupabaseActivityLogRepository(supabase),
    webhookEventRepository: new SupabaseWebhookEventRepository(supabase),
    outboundCommandRepository: new SupabaseOutboundCommandRepository(supabase),
    outboxRepository: new SupabaseOutboxRepository(supabase),
    contactRepository: new SupabaseContactRepository(supabase),
    channelAccountRepository: new SupabaseChannelAccountRepository(supabase)
  };
}
