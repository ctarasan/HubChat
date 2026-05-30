import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyRedactedRawPayloadJson } from "../../../lib/retentionPurgeExecute.js";

function hasJsonbKeys(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

export class SupabaseRetentionRawPayloadPurgeRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async redactWebhookPayloads(input: {
    tenantId: string;
    receivedBeforeIso: string;
    limit: number;
  }): Promise<number> {
    if (input.limit <= 0) return 0;

    const { data: rows, error: selectError } = await this.supabase
      .from("webhook_events")
      .select("id,payload_json")
      .eq("tenant_id", input.tenantId)
      .lt("received_at", input.receivedBeforeIso)
      .order("received_at", { ascending: true })
      .limit(input.limit * 3);
    if (selectError) throw selectError;

    const ids = (rows ?? [])
      .filter((row) => hasJsonbKeys((row as { payload_json?: unknown }).payload_json))
      .slice(0, input.limit)
      .map((row) => String((row as { id: string }).id));
    if (ids.length === 0) return 0;

    const { data: updated, error: updateError } = await this.supabase
      .from("webhook_events")
      .update({ payload_json: emptyRedactedRawPayloadJson() })
      .eq("tenant_id", input.tenantId)
      .in("id", ids)
      .select("id");
    if (updateError) throw updateError;
    return (updated ?? []).length;
  }

  async redactMessageRawPayloads(input: {
    tenantId: string;
    archivedConversationIds: string[];
    createdBeforeIso: string;
    limit: number;
  }): Promise<number> {
    if (input.limit <= 0 || input.archivedConversationIds.length === 0) return 0;

    const { data: rows, error: selectError } = await this.supabase
      .from("messages")
      .select("id,raw_payload")
      .eq("tenant_id", input.tenantId)
      .in("conversation_id", input.archivedConversationIds)
      .lt("created_at", input.createdBeforeIso)
      .order("created_at", { ascending: true })
      .limit(input.limit * 3);
    if (selectError) throw selectError;

    const ids = (rows ?? [])
      .filter((row) => hasJsonbKeys((row as { raw_payload?: unknown }).raw_payload))
      .slice(0, input.limit)
      .map((row) => String((row as { id: string }).id));
    if (ids.length === 0) return 0;

    const { data: updated, error: updateError } = await this.supabase
      .from("messages")
      .update({ raw_payload: emptyRedactedRawPayloadJson() })
      .eq("tenant_id", input.tenantId)
      .in("id", ids)
      .select("id");
    if (updateError) throw updateError;
    return (updated ?? []).length;
  }
}
