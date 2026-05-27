import type { ChannelType } from "../domain/entities.js";
import type { MarketingEventRecord, MarketingEventType } from "../domain/marketingEvents.js";

export const MARKETING_AUTOMATION_BRIDGE_SCHEMA_VERSION = "1" as const;
export const MARKETING_AUTOMATION_BRIDGE_SOURCE = "hubchat" as const;

/** HubChat marketing_events types supported by the automation bridge mapper (M2-A). */
export const MARKETING_AUTOMATION_BRIDGE_EVENT_TYPES = [
  "AGENT_MESSAGE_SENT",
  "CUSTOMER_MESSAGE_RECEIVED",
  "LEAD_STATUS_CHANGED",
  "CONVERSATION_STATUS_CHANGED",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_CLEARED"
] as const;

export type MarketingAutomationBridgeEventType = (typeof MARKETING_AUTOMATION_BRIDGE_EVENT_TYPES)[number];

const SUPPORTED_BRIDGE_EVENT_TYPES = new Set<string>(MARKETING_AUTOMATION_BRIDGE_EVENT_TYPES);

const CHANNEL_TYPES = new Set<string>(["LINE", "FACEBOOK", "INSTAGRAM"]);

export type MarketingAutomationBridgePayload = {
  schemaVersion: typeof MARKETING_AUTOMATION_BRIDGE_SCHEMA_VERSION;
  source: typeof MARKETING_AUTOMATION_BRIDGE_SOURCE;
  tenantId: string;
  eventId: string;
  eventType: MarketingAutomationBridgeEventType;
  occurredAt: string;
  channel: ChannelType | null;
  conversationId: string | null;
  /** Stable internal contact key (HubChat lead id). */
  contactId: string | null;
  messageId: string | null;
  messageType: string | null;
  leadStatus: string | null;
  conversationStatus: string | null;
};

export function isMarketingAutomationBridgeSupported(
  eventType: MarketingEventType
): eventType is MarketingAutomationBridgeEventType {
  return SUPPORTED_BRIDGE_EVENT_TYPES.has(eventType);
}

function normalizeChannel(channel: string | null | undefined): ChannelType | null {
  if (channel == null) return null;
  const upper = channel.trim().toUpperCase();
  return CHANNEL_TYPES.has(upper) ? (upper as ChannelType) : null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractMessageId(metadata: Record<string, unknown>): string | null {
  return readMetadataString(metadata, "messageId");
}

function extractMessageType(metadata: Record<string, unknown>): string | null {
  return readMetadataString(metadata, "messageType");
}

function extractLeadStatus(eventType: MarketingEventType, metadata: Record<string, unknown>): string | null {
  if (eventType !== "LEAD_STATUS_CHANGED") return null;
  return readMetadataString(metadata, "to");
}

function extractConversationStatus(
  eventType: MarketingEventType,
  metadata: Record<string, unknown>
): string | null {
  if (eventType !== "CONVERSATION_STATUS_CHANGED") return null;
  return readMetadataString(metadata, "to");
}

/**
 * Map an internal marketing_events row to a normalized automation bridge payload.
 * Returns null for unsupported event types. Never includes message body, secrets, or raw metadata.
 */
export function mapMarketingEventToAutomationBridge(
  record: MarketingEventRecord
): MarketingAutomationBridgePayload | null {
  if (!isMarketingAutomationBridgeSupported(record.eventType)) {
    return null;
  }

  const metadata = record.metadata ?? {};

  return {
    schemaVersion: MARKETING_AUTOMATION_BRIDGE_SCHEMA_VERSION,
    source: MARKETING_AUTOMATION_BRIDGE_SOURCE,
    tenantId: record.tenantId,
    eventId: record.id,
    eventType: record.eventType,
    occurredAt: record.occurredAt,
    channel: normalizeChannel(record.channel),
    conversationId: record.conversationId,
    contactId: record.leadId,
    messageId: extractMessageId(metadata),
    messageType: extractMessageType(metadata),
    leadStatus: extractLeadStatus(record.eventType, metadata),
    conversationStatus: extractConversationStatus(record.eventType, metadata)
  };
}

/** Keys that must never appear on bridge payloads (privacy / security regression guard). */
export const MARKETING_AUTOMATION_BRIDGE_FORBIDDEN_PAYLOAD_KEYS = [
  "content",
  "body",
  "text",
  "messageBody",
  "mediaUrl",
  "signedUrl",
  "accessToken",
  "token",
  "secret",
  "password",
  "authorization",
  "webhookPayload",
  "rawPayload",
  "metadata",
  "metadataJson"
] as const;

export function bridgePayloadHasForbiddenKeys(payload: MarketingAutomationBridgePayload): string[] {
  const hits: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        MARKETING_AUTOMATION_BRIDGE_FORBIDDEN_PAYLOAD_KEYS.some(
          (forbidden) => lower === forbidden.toLowerCase() || lower.includes(forbidden.toLowerCase())
        )
      ) {
        hits.push(path ? `${path}.${key}` : key);
      }
      walk(nested, path ? `${path}.${key}` : key);
    }
  };
  walk(payload, "");
  return hits;
}
