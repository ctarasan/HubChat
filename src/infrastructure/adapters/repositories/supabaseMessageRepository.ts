import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "../../../domain/entities.js";
import type {
  MessageDeliveryFailurePayload,
  MessageDeliverySnapshot,
  MessageRepository
} from "../../../domain/ports.js";
import { toIsoTimestamp } from "../../../domain/dateUtils.js";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

/**
 * Explicit columns for inbox message timeline (no select("*") on list paths).
 * Must match deployed `messages` columns in schema/migrations (no occurred_at / media_mime_type / file_name).
 */
const MESSAGE_LIST_SELECT =
  "id,tenant_id,conversation_id,channel_type,external_message_id,message_type,direction,sender_type," +
  "content,created_at,media_url,preview_url,file_size_bytes,metadata_json";

const MESSAGE_INSERT_SELECT = MESSAGE_LIST_SELECT;

function readMetadataString(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mapMessage(row: any): Message {
  const metadata = (row.metadata_json ?? row.metadataJson ?? {}) as Record<string, unknown>;
  const createdAt = new Date(row.created_at ?? row.createdAt);
  const occurredAtRaw = row.occurred_at ?? row.occurredAt;
  const occurredAt =
    occurredAtRaw != null && String(occurredAtRaw).trim()
      ? new Date(occurredAtRaw)
      : createdAt;
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
    mediaMimeType:
      row.media_mime_type ??
      row.mediaMimeType ??
      readMetadataString(metadata, "mediaMimeType", "mimeType", "media_mime_type") ??
      null,
    fileName:
      row.file_name ?? row.fileName ?? readMetadataString(metadata, "fileName", "file_name") ?? null,
    fileSizeBytes:
      row.file_size_bytes ??
      row.fileSizeBytes ??
      (typeof metadata.fileSizeBytes === "number" && Number.isFinite(metadata.fileSizeBytes)
        ? Number(metadata.fileSizeBytes)
        : null),
    metadataJson: metadata,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? createdAt : occurredAt,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
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
      .select(MESSAGE_INSERT_SELECT)
      .single();
    if (error) throw error;
    return mapMessage(row);
  }

  async getDeliverySnapshot(messageId: string): Promise<MessageDeliverySnapshot | null> {
    const { data, error } = await this.supabase
      .from("messages")
      .select("external_message_id, metadata_json")
      .eq("id", messageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const meta = (data.metadata_json ?? {}) as Record<string, unknown>;
    const raw = meta.delivery_status;
    let deliveryStatus: MessageDeliverySnapshot["deliveryStatus"] = "PENDING";
    if (raw === "SENT") deliveryStatus = "SENT";
    else if (raw === "FAILED") deliveryStatus = "FAILED";
    return {
      externalMessageId:
        typeof data.external_message_id === "string" && data.external_message_id.trim()
          ? data.external_message_id.trim()
          : null,
      deliveryStatus
    };
  }

  async markSent(messageId: string, externalMessageId?: string | null): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from("messages")
      .select("metadata_json")
      .eq("id", messageId)
      .maybeSingle();
    if (existingError) throw existingError;
    const prev = (existing?.metadata_json ?? {}) as Record<string, unknown>;
    const {
      failed_at: _fa,
      delivery_failed_at: _dfa,
      delivery_error_code: _dec,
      delivery_error_message: _dem,
      reason: _rs,
      ...rest
    } = prev;
    const patch: Record<string, unknown> = {
      metadata_json: { ...rest, delivery_status: "SENT", sent_at: new Date().toISOString() }
    };
    if (typeof externalMessageId === "string" && externalMessageId.trim()) {
      patch.external_message_id = externalMessageId.trim();
    }
    const { error } = await this.supabase.from("messages").update(patch).eq("id", messageId);
    if (error) throw error;
  }

  async markFailed(messageId: string, failure: string | MessageDeliveryFailurePayload): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from("messages")
      .select("metadata_json")
      .eq("id", messageId)
      .maybeSingle();
    if (existingError) throw existingError;
    const prev = (existing?.metadata_json ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const metadata =
      typeof failure === "string"
        ? {
            ...prev,
            delivery_status: "FAILED",
            failed_at: now,
            delivery_failed_at: now,
            reason: failure
          }
        : {
            ...prev,
            delivery_status: "FAILED",
            failed_at: now,
            delivery_failed_at: now,
            delivery_error_code: failure.deliveryErrorCode,
            delivery_error_message: failure.userFacingMessage,
            reason: failure.technicalReason ?? failure.userFacingMessage
          };
    const { error } = await this.supabase.from("messages").update({ metadata_json: metadata }).eq("id", messageId);
    if (error) throw error;
  }

  private async listMessagesQuery(input: {
    tenantId: string;
    conversationIds: string[];
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }> {
    const safeLimit = Math.max(1, Math.min(100, input.limit));
    const cursor = decodeRepoCursor<{ createdAt: string; id: string }>(input.cursor);
    const ids = [...new Set(input.conversationIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { items: [], nextCursor: null };
    }

    let q = this.supabase
      .from("messages")
      .select(MESSAGE_LIST_SELECT)
      .eq("tenant_id", input.tenantId)
      .in("conversation_id", ids)
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
    const tail = items[items.length - 1] ?? rows[safeLimit - 1];
    const nextCursor =
      rows.length > safeLimit && tail
        ? encodeRepoCursor({
            createdAt: toIsoTimestamp(tail.createdAt),
            id: String(tail.id)
          })
        : null;
    return { items, nextCursor };
  }

  async listByConversation(input: {
    tenantId: string;
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }> {
    return this.listMessagesQuery({
      tenantId: input.tenantId,
      conversationIds: [input.conversationId],
      limit: input.limit,
      cursor: input.cursor
    });
  }

  async listByConversationIds(input: {
    tenantId: string;
    conversationIds: string[];
    limit: number;
    cursor?: string;
  }): Promise<{ items: Message[]; nextCursor: string | null }> {
    return this.listMessagesQuery(input);
  }
}
