import type { MarketingAutomationBridgePayload } from "../lib/marketingAutomationBridge.js";

export const MARKETING_AUTOMATION_BRIDGE_OUTBOX_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "DEAD_LETTER"
] as const;

export type MarketingAutomationBridgeOutboxStatus =
  (typeof MARKETING_AUTOMATION_BRIDGE_OUTBOX_STATUSES)[number];

export type MarketingAutomationBridgeOutboxRecord = {
  id: string;
  tenantId: string;
  marketingEventId: string;
  eventType: string;
  payloadJson: MarketingAutomationBridgePayload;
  schemaVersion: string;
  status: MarketingAutomationBridgeOutboxStatus;
  availableAt: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

export type MarketingAutomationBridgeOutboxEnqueueResult = "enqueued" | "duplicate";

export type MarketingAutomationBridgeOutboxFailureResult = {
  deadLetter: boolean;
  attemptCount: number;
  nextAvailableAt: string;
};

export function buildMarketingAutomationBridgeIdempotencyKey(
  tenantId: string,
  marketingEventId: string
): string {
  return `marketing-bridge:${tenantId}:${marketingEventId}`;
}
