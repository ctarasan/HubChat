import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../../../domain/entities.js";
import type { MessageRepository } from "../../../domain/ports.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

function mapMessage(row: any): Message {
  const metadata = (row.metadata_json ?? row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    channelType: row.channel_type,
    externalMessageId: row.external_message_id,
    messageType: row.message_type ?? row.messageType,
    direction: row.direction,
    senderType: row.sender_type,
    content: row.content,
    mediaUrl: row.media_url ?? row.mediaUrl ?? (typeof metadata.mediaUrl === "string" ? metadata.mediaUrl : null),
    previewUrl: row.preview_url ?? row.previewUrl ?? (typeof metadata.previewUrl === "string" ? metadata.previewUrl : null),
    mediaMimeType: row.media_mime_type ?? row.mediaMimeType ?? null,
    fileName: row.file_name ?? row.fileName ?? null,
    fileSizeBytes: row.file_size_bytes ?? row.fileSizeBytes ?? null,
    metadataJson: metadata,
    createdAt: new Date(row.created_at)
  };
}

export class SupabaseMessageRepository implements MessageRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const metadata = (data.metadataJson ?? {}) as Record<string, unknown>;
    const mediaUrlFromMetadata =
      typeof metadata.mediaUrl === "string" && metadata.mediaUrl.trim() ? metadata.mediaUrl.trim() : null;
    const previewUrlFromMetadata =
      typeof metadata.previewUrl === "string" && metadata.previewUrl.trim() ? metadata.previewUrl.trim() : null;
    const insertPayload: Record<string, unknown> = {
      tenant_id: data.tenantId,
      conversation_id: data.conversationId,
      channel_type: data.channelType,
      external_message_id: data.externalMessageId,
      message_type: data.messageType ?? "TEXT",
      direction: data.direction,
      sender_type: data.senderType,
      content: data.content,
      media_url: data.mediaUrl ?? mediaUrlFromMetadata,
      preview_url: data.previewUrl ?? previewUrlFromMetadata,
      metadata_json: data.metadataJson ?? {}
    };
    if (typeof data.mediaMimeType === "string" && data.mediaMimeType.trim()) {
      insertPayload.media_mime_type = data.mediaMimeType.trim();
    }
    if (typeof data.fileName === "string" && data.fileName.trim()) {
      insertPayload.file_name = data.fileName.trim();
    }
    if (typeof data.fileSizeBytes === "number" && Number.isFinite(data.fileSizeBytes)) {
      insertPayload.file_size_bytes = data.fileSizeBytes;
    }
    const { data: row, error } = await this.supabase
      .from("messages")
      .insert(insertPayload)
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
