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
import { SupabaseConversationEventRepository } from "../../infrastructure/adapters/repositories/supabaseConversationEventRepository.js";
import { SupabaseSalesAgentRepository } from "../../infrastructure/adapters/repositories/supabaseSalesAgentRepository.js";
import { SupabaseChannelSettingRepository } from "../../infrastructure/adapters/repositories/supabaseChannelSettingRepository.js";
import { SupabaseMarketingEventRepository } from "../../infrastructure/adapters/repositories/supabaseMarketingEventRepository.js";
import { SupabaseSlaPolicyRepository } from "../../infrastructure/adapters/repositories/supabaseSlaPolicyRepository.js";
import { SupabaseChannelConnectionRepository } from "../../infrastructure/adapters/repositories/supabaseChannelConnectionRepository.js";
import { SupabaseOAuthTransactionRepository } from "../../infrastructure/adapters/repositories/supabaseOAuthTransactionRepository.js";
import { SupabaseInstagramOAuthCredentialRepository } from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthCredentialRepository.js";

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
    channelAccountRepository: new SupabaseChannelAccountRepository(supabase),
    conversationEventRepository: new SupabaseConversationEventRepository(supabase),
    salesAgentRepository: new SupabaseSalesAgentRepository(supabase),
    channelSettingRepository: new SupabaseChannelSettingRepository(supabase),
    marketingEventRepository: new SupabaseMarketingEventRepository(supabase),
    slaPolicyRepository: new SupabaseSlaPolicyRepository(supabase),
    channelConnectionRepository: new SupabaseChannelConnectionRepository(supabase),
    oauthTransactionRepository: new SupabaseOAuthTransactionRepository(supabase),
    instagramOAuthCredentialRepository: new SupabaseInstagramOAuthCredentialRepository(supabase)
  };
}
