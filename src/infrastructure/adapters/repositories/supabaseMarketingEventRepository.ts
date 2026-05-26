import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateMarketingEventInput, MarketingEventRecord, MarketingEventType } from "../../../domain/marketingEvents.js";
import type { MarketingEventRepository } from "../../../domain/ports.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

function mapRow(row: Record<string, unknown>): MarketingEventRecord {
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenant_id ?? ""),
    leadId: row.lead_id == null ? null : String(row.lead_id),
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    channel: row.channel == null ? null : String(row.channel),
    eventType: String(row.event_type ?? "") as MarketingEventType,
    occurredAt: String(row.occurred_at ?? ""),
    actorType: String(row.actor_type ?? "SYSTEM") as MarketingEventRecord["actorType"],
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    metadata: (row.metadata_json as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? "")
  };
}

export class SupabaseMarketingEventRepository implements MarketingEventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async insert(input: CreateMarketingEventInput): Promise<void> {
    const { error } = await this.supabase.from("marketing_events").insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      channel: input.channel ?? null,
      event_type: input.eventType,
      occurred_at: input.occurredAt.toISOString(),
      actor_type: input.actorType,
      actor_user_id: input.actorUserId ?? null,
      metadata_json: input.metadata ?? {}
    });
    if (error) throw error;
  }

  async list(input: {
    tenantId: string;
    leadId?: string;
    conversationId?: string;
    eventType?: MarketingEventType;
    assignedSalesAgentId?: string | null;
    limit: number;
    cursor?: string;
  }): Promise<{ items: MarketingEventRecord[]; nextCursor: string | null }> {
    void input.assignedSalesAgentId;
    const safeLimit = Math.max(1, Math.min(100, input.limit));
    const cursor = decodeRepoCursor<{ occurredAt: string; id: string }>(input.cursor);

    let q = this.supabase
      .from("marketing_events")
      .select(
        "id, tenant_id, lead_id, conversation_id, channel, event_type, occurred_at, actor_type, actor_user_id, metadata_json, created_at"
      )
      .eq("tenant_id", input.tenantId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit + 1);

    if (input.leadId) q = q.eq("lead_id", input.leadId);
    if (input.conversationId) q = q.eq("conversation_id", input.conversationId);
    if (input.eventType) q = q.eq("event_type", input.eventType);

    if (cursor?.occurredAt && cursor?.id) {
      q = q.or(
        `occurred_at.lt."${cursor.occurredAt}",and(occurred_at.eq."${cursor.occurredAt}",id.lt."${cursor.id}")`
      );
    }

    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.slice(0, safeLimit).map((row) => mapRow(row as Record<string, unknown>));
    const tail = items[items.length - 1];
    const nextCursor =
      rows.length > safeLimit && tail
        ? encodeRepoCursor({ occurredAt: tail.occurredAt, id: tail.id })
        : null;
    return { items, nextCursor };
  }
}
