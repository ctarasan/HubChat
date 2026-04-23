import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEventRepository } from "../../../domain/ports.js";

export class SupabaseWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveIfNotExists(input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
  }): Promise<"inserted" | "duplicate"> {
    const { error } = await this.supabase.from("webhook_events").insert({
      tenant_id: input.tenantId,
      channel_type: input.channelType,
      external_event_id: input.externalEventId,
      idempotency_key: input.idempotencyKey,
      payload_json: input.payloadJson
    });

    if (!error) return "inserted";
    if (String(error.message).toLowerCase().includes("duplicate") || error.code === "23505") {
      return "duplicate";
    }
    throw error;
  }

  async saveInboundAndOutboxIfNotExists(input: {
    tenantId: string;
    channelType: "LINE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "SHOPEE" | "LAZADA";
    externalEventId: string;
    idempotencyKey: string;
    payloadJson: Record<string, unknown>;
    outboxTopic: string;
    outboxPayload: Record<string, unknown>;
    outboxIdempotencyKey: string;
  }): Promise<"inserted" | "duplicate"> {
    const { data, error } = await this.supabase.rpc("save_webhook_event_with_outbox", {
      p_tenant_id: input.tenantId,
      p_channel_type: input.channelType,
      p_external_event_id: input.externalEventId,
      p_idempotency_key: input.idempotencyKey,
      p_payload_json: input.payloadJson,
      p_outbox_topic: input.outboxTopic,
      p_outbox_payload_json: input.outboxPayload,
      p_outbox_idempotency_key: input.outboxIdempotencyKey
    });
    if (error) throw error;
    return data ? "inserted" : "duplicate";
  }
}
