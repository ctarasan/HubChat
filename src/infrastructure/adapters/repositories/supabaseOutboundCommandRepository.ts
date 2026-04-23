import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelType } from "../../../domain/entities.js";
import type { OutboundCommandPort } from "../../../domain/ports.js";

export class SupabaseOutboundCommandRepository implements OutboundCommandPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async createOutboundMessageAndOutbox(input: {
    tenantId: string;
    leadId: string;
    conversationId: string;
    channel: ChannelType;
    channelThreadId: string;
    content: string;
    messageType?: "TEXT" | "IMAGE";
    mediaUrl?: string;
    previewUrl?: string;
    mediaMimeType?: "image/jpeg" | "image/png" | "image/webp";
    fileSizeBytes?: number;
    width?: number;
    height?: number;
  }): Promise<{ messageId: string }> {
    const { data, error } = await this.supabase.rpc("create_outbound_message_with_outbox", {
      p_tenant_id: input.tenantId,
      p_lead_id: input.leadId,
      p_conversation_id: input.conversationId,
      p_channel: input.channel,
      p_channel_thread_id: input.channelThreadId,
      p_content: input.content,
      p_message_type: input.messageType ?? "TEXT",
      p_media_url: input.mediaUrl ?? null,
      p_preview_url: input.previewUrl ?? null,
      p_media_mime_type: input.mediaMimeType ?? null,
      p_file_size_bytes: input.fileSizeBytes ?? null,
      p_width: input.width ?? null,
      p_height: input.height ?? null
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.message_id) {
      throw new Error("create_outbound_message_with_outbox returned no message_id");
    }
    return { messageId: String(row.message_id) };
  }
}
