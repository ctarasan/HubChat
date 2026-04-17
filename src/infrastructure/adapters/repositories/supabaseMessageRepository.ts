import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../../../domain/entities.js";
import type { MessageRepository } from "../../../domain/ports.js";

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
        content: data.content
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapMessage(row);
  }

  async markSent(messageId: string, externalMessageId?: string | null): Promise<void> {
    const patch: Record<string, unknown> = {
      metadata_json: { delivery_status: "SENT", sent_at: new Date().toISOString() }
    };
    if (typeof externalMessageId === "string" && externalMessageId.trim()) {
      patch.external_message_id = externalMessageId.trim();
    }
    const { error } = await this.supabase.from("messages").update(patch).eq("id", messageId);
    if (error) throw error;
  }

  async markFailed(messageId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from("messages")
      .update({
        metadata_json: { delivery_status: "FAILED", failed_at: new Date().toISOString(), reason }
      })
      .eq("id", messageId);
    if (error) throw error;
  }
}
