import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadEventRepository } from "../../../domain/ports.js";

export class SupabaseLeadEventRepository implements LeadEventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(input: Parameters<LeadEventRepository["create"]>[0]): Promise<void> {
    const { error } = await this.supabase.from("lead_events").insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      event_name: input.eventName,
      event_payload: input.eventPayload ?? {},
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      created_by_user_id: input.createdByUserId ?? null
    });
    if (error) throw error;
  }
}
