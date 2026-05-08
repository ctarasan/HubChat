import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadAssignmentRepository } from "../../../domain/ports.js";

export class SupabaseLeadAssignmentRepository implements LeadAssignmentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(input: Parameters<LeadAssignmentRepository["create"]>[0]): Promise<void> {
    const { error } = await this.supabase.from("lead_assignments").insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      from_user_id: input.fromUserId ?? null,
      to_user_id: input.toUserId ?? null,
      assigned_by_user_id: input.assignedByUserId ?? null,
      reason: input.reason ?? null,
      created_at: (input.createdAt ?? new Date()).toISOString()
    });
    if (error) throw error;
  }
}
