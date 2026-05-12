import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationEventRepository, ConversationEventType } from "../../../domain/ports.js";

export class SupabaseConversationEventRepository implements ConversationEventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(input: {
    tenantId: string;
    conversationId: string;
    leadId: string | null;
    actorSalesAgentId: string | null;
    actorAuthUserId: string | null;
    eventType: ConversationEventType;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    metadataJson: Record<string, unknown>;
    note: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.from("conversation_events").insert({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      lead_id: input.leadId,
      actor_sales_agent_id: input.actorSalesAgentId,
      actor_auth_user_id: input.actorAuthUserId,
      event_type: input.eventType,
      old_value: input.oldValue,
      new_value: input.newValue,
      metadata_json: input.metadataJson,
      note: input.note
    });
    if (error) throw error;
  }
}
