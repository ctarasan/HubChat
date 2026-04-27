import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../../../domain/entities.js";
import type { MessageRepository } from "../../../domain/ports.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

function mapMessage(row: any): Message {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    channelType: row.channel_type,
    externalMessageId: row.external_message_id,
    messageType: row.message_type,
    direction: row.direction,
    senderType: row.sender_type,
    content: row.content,
    metadataJson: (row.metadata_json ?? {}) as Record<string, unknown>,
    createdAt: new Date(row.created_at)
  };
}

export class SupabaseMessageRepository implements MessageRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const { data: row, error } = await this.supabase
      .from("messages")
      .insert({
        tenant_id: data.tenantId,
        conversation_id: data.conversationId,
        channel_type: data.channelType,
        external_message_id: data.externalMessageId,
        message_type: data.messageType ?? "TEXT",
        direction: data.direction,
        sender_type: data.senderType,
        content: data.content,
        metadata_json: data.metadataJson ?? {}
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapMessage(row);
  }

  async markSent(messageId: string, externalMessageId?: string | null): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from("messages")
      .select("metadata_json")
      .eq("id", messageId)
      .maybeSingle();
    if (existingError) throw existingError;
    const prev = (existing?.metadata_json ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      metadata_json: { ...prev, delivery_status: "SENT", sent_at: new Date().toISOString() }
    };
    if (typeof externalMessageId === "string" && externalMessageId.trim()) {
      patch.external_message_id = externalMessageId.trim();
    }
    const { error } = await this.supabase.from("messages").update(patch).eq("id", messageId);
    if (error) throw error;
  }

  async markFailed(messageId: string, reason: string): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from("messages")
      .select("metadata_json")
      .eq("id", messageId)
      .maybeSingle();
    if (existingError) throw existingError;
    const prev = (existing?.metadata_json ?? {}) as Record<string, unknown>;
    const { error } = await this.supabase
      .from("messages")
      .update({
        metadata_json: { ...prev, delivery_status: "FAILED", failed_at: new Date().toISOString(), reason }
      })
      .eq("id", messageId);
    if (error) throw error;
  }

  async listByConversation(input: {
    tenantId: string;
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }> {
    const safeLimit = Math.max(1, Math.min(100, input.limit));
    const cursor = decodeRepoCursor<{ createdAt: string; id: string }>(input.cursor);

    let q = this.supabase
      .from("messages")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit + 1);
    if (cursor?.createdAt && cursor?.id) {
      q = q.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt."${cursor.id}")`);
    }

    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    const items = rows.slice(0, safeLimit).map(mapMessage);
    const tail = rows[safeLimit - 1];
    const nextCursor =
      rows.length > safeLimit && tail
        ? encodeRepoCursor({ createdAt: String(tail.created_at), id: String(tail.id) })
        : null;
    return { items, nextCursor };
  }
}
