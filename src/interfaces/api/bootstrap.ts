import { createServiceSupabaseClient } from "../../infrastructure/supabase/client.js";
import { DbQueue } from "../../infrastructure/adapters/queue/dbQueue.js";
import { SupabaseLeadRepository } from "../../infrastructure/adapters/repositories/supabaseLeadRepository.js";
import { SupabaseConversationRepository } from "../../infrastructure/adapters/repositories/supabaseConversationRepository.js";
import { SupabaseMessageRepository } from "../../infrastructure/adapters/repositories/supabaseMessageRepository.js";
import { SupabaseActivityLogRepository } from "../../infrastructure/adapters/repositories/supabaseActivityLogRepository.js";
import { SupabaseWebhookEventRepository } from "../../infrastructure/adapters/repositories/supabaseWebhookEventRepository.js";

export function apiBootstrap() {
  const supabase = createServiceSupabaseClient();
  return {
    supabase,
    queue: new DbQueue(supabase),
    leadRepository: new SupabaseLeadRepository(supabase),
    conversationRepository: new SupabaseConversationRepository(supabase),
    messageRepository: new SupabaseMessageRepository(supabase),
    activityLogRepository: new SupabaseActivityLogRepository(supabase),
    webhookEventRepository: new SupabaseWebhookEventRepository(supabase)
  };
}
