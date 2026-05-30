import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RETENTION_POLICY,
  subtractRetentionDays,
  type RetentionPolicyConfig
} from "../../../lib/retentionPolicy.js";
import type {
  ArchivedConversationRow,
  MessageRetentionRow
} from "../../../lib/retentionDryRun.js";

function mapConversation(row: Record<string, unknown>): ArchivedConversationRow {
  return {
    id: String(row.id ?? ""),
    leadId: typeof row.lead_id === "string" ? row.lead_id : row.lead_id == null ? null : String(row.lead_id),
    channelType: String(row.channel_type ?? ""),
    status: String(row.status ?? ""),
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : null
  };
}

function mapMessage(row: Record<string, unknown>): MessageRetentionRow {
  const meta = row.metadata_json;
  const raw = row.raw_payload;
  return {
    conversationId: String(row.conversation_id ?? ""),
    messageType: typeof row.message_type === "string" ? row.message_type : null,
    mediaUrl: typeof row.media_url === "string" ? row.media_url : null,
    previewUrl: typeof row.preview_url === "string" ? row.preview_url : null,
    metadataJson:
      meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null,
    rawPayload: raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString()
  };
}

const ARCHIVED_CONVERSATION_SELECT =
  "id,lead_id,channel_type,status,resolved_at,closed_at,updated_at,last_message_at";

const MESSAGE_RETENTION_SELECT =
  "conversation_id,message_type,media_url,preview_url,metadata_json,raw_payload,created_at";

export class SupabaseRetentionDryRunRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async fetchDryRunInput(
    tenantId: string,
    policy: RetentionPolicyConfig = DEFAULT_RETENTION_POLICY,
    now: Date = new Date()
  ): Promise<{
    archivedConversations: ArchivedConversationRow[];
    messages: MessageRetentionRow[];
    webhookRawPayloadEligibleCount: number;
  }> {
    const { data: convRows, error: convError } = await this.supabase
      .from("conversations")
      .select(ARCHIVED_CONVERSATION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "ARCHIVED");
    if (convError) throw convError;

    const archivedConversations = (convRows ?? []).map((row) => mapConversation(row as Record<string, unknown>));
    const conversationIds = archivedConversations.map((c) => c.id).filter(Boolean);

    let messages: MessageRetentionRow[] = [];
    if (conversationIds.length > 0) {
      const { data: messageRows, error: messageError } = await this.supabase
        .from("messages")
        .select(MESSAGE_RETENTION_SELECT)
        .eq("tenant_id", tenantId)
        .in("conversation_id", conversationIds);
      if (messageError) throw messageError;
      messages = (messageRows ?? []).map((row) => mapMessage(row as Record<string, unknown>));
    }

    const rawPayloadCutoff = subtractRetentionDays(now, policy.rawPayloadRetentionDays).toISOString();
    const { count: webhookCount, error: webhookError } = await this.supabase
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .lt("received_at", rawPayloadCutoff);
    if (webhookError) throw webhookError;

    return {
      archivedConversations,
      messages,
      webhookRawPayloadEligibleCount: webhookCount ?? 0
    };
  }
}
