import { z } from "zod";

export const MARKETING_EVENT_TYPES = [
  "LEAD_CREATED",
  "LEAD_STATUS_CHANGED",
  "CONVERSATION_CREATED",
  "CONVERSATION_STATUS_CHANGED",
  "CUSTOMER_MESSAGE_RECEIVED",
  "AGENT_MESSAGE_SENT",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_CLEARED",
  "SLA_DUE_SET",
  "SLA_CLEARED"
] as const;

export type MarketingEventType = (typeof MARKETING_EVENT_TYPES)[number];

export const MARKETING_ACTOR_TYPES = ["SYSTEM", "CUSTOMER", "AGENT"] as const;
export type MarketingActorType = (typeof MARKETING_ACTOR_TYPES)[number];

export const MarketingEventTypeSchema = z.enum(MARKETING_EVENT_TYPES);
export const MarketingActorTypeSchema = z.enum(MARKETING_ACTOR_TYPES);

export type MarketingEventRecord = {
  id: string;
  tenantId: string;
  leadId: string | null;
  conversationId: string | null;
  channel: string | null;
  eventType: MarketingEventType;
  occurredAt: string;
  actorType: MarketingActorType;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreateMarketingEventInput = {
  tenantId: string;
  leadId?: string | null;
  conversationId?: string | null;
  channel?: string | null;
  eventType: MarketingEventType;
  occurredAt: Date;
  actorType: MarketingActorType;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};
