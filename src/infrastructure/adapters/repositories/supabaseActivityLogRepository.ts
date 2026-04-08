import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityLogRepository } from "../../../domain/ports.js";

export class SupabaseActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(input: {
    tenantId: string;
    leadId: string;
    type: "MESSAGE_SENT" | "MESSAGE_RECEIVED" | "STATUS_CHANGED" | "ASSIGNED" | "NOTE_ADDED";
    metadataJson: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase.from("activity_logs").insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      type: input.type,
      metadata_json: input.metadataJson
    });
    if (error) throw error;
  }
}
