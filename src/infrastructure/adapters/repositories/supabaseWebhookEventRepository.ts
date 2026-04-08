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
}
