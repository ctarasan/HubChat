import test from "node:test";
import assert from "node:assert/strict";
import type { MarketingEventRecord } from "../domain/marketingEvents.js";
import {
  MARKETING_AUTOMATION_BRIDGE_SCHEMA_VERSION,
  MARKETING_AUTOMATION_BRIDGE_SOURCE,
  bridgePayloadHasForbiddenKeys,
  mapMarketingEventToAutomationBridge
} from "./marketingAutomationBridge.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const EVENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LEAD_ID = "9e68eadd-01b6-4c66-a522-74b97d6a6902";
const CONVERSATION_ID = "d17bc402-7461-48fb-8b75-f2f3b02eb1b1";
const MESSAGE_ID = "30f75b4e-cf3d-49fe-a57a-4f2e44fdca01";

function baseRecord(overrides: Partial<MarketingEventRecord> = {}): MarketingEventRecord {
  return {
    id: EVENT_ID,
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    conversationId: CONVERSATION_ID,
    channel: "INSTAGRAM",
    eventType: "AGENT_MESSAGE_SENT",
    occurredAt: "2026-05-26T10:00:00.000Z",
    actorType: "AGENT",
    actorUserId: null,
    metadata: {},
    createdAt: "2026-05-26T10:00:01.000Z",
    ...overrides
  };
}

test("AGENT_MESSAGE_SENT text maps to normalized payload", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      channel: "LINE",
      metadata: { messageId: MESSAGE_ID, messageType: "TEXT" }
    })
  );

  assert.ok(payload);
  assert.equal(payload.schemaVersion, MARKETING_AUTOMATION_BRIDGE_SCHEMA_VERSION);
  assert.equal(payload.source, MARKETING_AUTOMATION_BRIDGE_SOURCE);
  assert.equal(payload.eventType, "AGENT_MESSAGE_SENT");
  assert.equal(payload.tenantId, TENANT_ID);
  assert.equal(payload.eventId, EVENT_ID);
  assert.equal(payload.occurredAt, "2026-05-26T10:00:00.000Z");
  assert.equal(payload.channel, "LINE");
  assert.equal(payload.conversationId, CONVERSATION_ID);
  assert.equal(payload.contactId, LEAD_ID);
  assert.equal(payload.messageId, MESSAGE_ID);
  assert.equal(payload.messageType, "TEXT");
  assert.equal(payload.leadStatus, null);
  assert.equal(payload.conversationStatus, null);
});

test("AGENT_MESSAGE_SENT image maps messageType without mediaUrl", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      metadata: {
        messageId: MESSAGE_ID,
        messageType: "IMAGE",
        mediaUrl: "https://signed.example/secret.jpg",
        content: "should not appear"
      }
    })
  );

  assert.ok(payload);
  assert.equal(payload.messageType, "IMAGE");
  assert.equal("mediaUrl" in payload, false);
  assert.equal("content" in payload, false);
  assert.deepEqual(bridgePayloadHasForbiddenKeys(payload), []);
});

test("missing optional metadata does not crash mapping", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      leadId: null,
      conversationId: null,
      channel: null,
      metadata: {}
    })
  );

  assert.ok(payload);
  assert.equal(payload.contactId, null);
  assert.equal(payload.conversationId, null);
  assert.equal(payload.channel, null);
  assert.equal(payload.messageId, null);
  assert.equal(payload.messageType, null);
});

test("unknown marketing event type returns null", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({ eventType: "LEAD_CREATED", metadata: { sourceChannel: "LINE" } })
  );
  assert.equal(payload, null);
});

test("payload never includes message body or secret-looking keys", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      metadata: {
        messageId: MESSAGE_ID,
        messageType: "TEXT",
        body: "hello customer",
        content: "hello",
        accessToken: "EAAB",
        signedUrl: "https://x",
        webhookPayload: { raw: true }
      }
    })
  );

  assert.ok(payload);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("hello customer"), false);
  assert.equal(serialized.includes("EAAB"), false);
  assert.deepEqual(bridgePayloadHasForbiddenKeys(payload), []);
});

test("schemaVersion and source are stable", () => {
  const payload = mapMarketingEventToAutomationBridge(baseRecord());
  assert.ok(payload);
  assert.equal(payload.schemaVersion, "1");
  assert.equal(payload.source, "hubchat");
});

test("channel values are preserved for LINE FACEBOOK INSTAGRAM", () => {
  for (const channel of ["LINE", "FACEBOOK", "INSTAGRAM"] as const) {
    const payload = mapMarketingEventToAutomationBridge(baseRecord({ channel }));
    assert.ok(payload);
    assert.equal(payload.channel, channel);
  }
  const unknown = mapMarketingEventToAutomationBridge(baseRecord({ channel: "SMS" }));
  assert.ok(unknown);
  assert.equal(unknown.channel, null);
});

test("LEAD_STATUS_CHANGED maps leadStatus from metadata.to", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      eventType: "LEAD_STATUS_CHANGED",
      metadata: { from: "NEW", to: "CONTACTED", fromManagement: "NEW", toManagement: "CONTACTED" }
    })
  );
  assert.ok(payload);
  assert.equal(payload.leadStatus, "CONTACTED");
  assert.equal(payload.conversationStatus, null);
});

test("CONVERSATION_STATUS_CHANGED maps conversationStatus from metadata.to", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      eventType: "CONVERSATION_STATUS_CHANGED",
      metadata: { from: "OPEN", to: "RESOLVED" }
    })
  );
  assert.ok(payload);
  assert.equal(payload.conversationStatus, "RESOLVED");
  assert.equal(payload.leadStatus, null);
});

test("CUSTOMER_MESSAGE_RECEIVED maps without message body fields", () => {
  const payload = mapMarketingEventToAutomationBridge(
    baseRecord({
      eventType: "CUSTOMER_MESSAGE_RECEIVED",
      actorType: "CUSTOMER",
      metadata: {
        messageType: "TEXT",
        externalMessageId: "ext-in-1",
        conversationCreated: true,
        leadCreated: false
      }
    })
  );
  assert.ok(payload);
  assert.equal(payload.messageType, "TEXT");
  assert.equal(payload.messageId, null);
  assert.deepEqual(bridgePayloadHasForbiddenKeys(payload), []);
});

test("FOLLOW_UP_SCHEDULED and FOLLOW_UP_CLEARED map safely", () => {
  const scheduled = mapMarketingEventToAutomationBridge(
    baseRecord({
      eventType: "FOLLOW_UP_SCHEDULED",
      metadata: { followUpAt: "2026-06-01T09:00:00.000Z" }
    })
  );
  assert.ok(scheduled);
  assert.equal(scheduled.eventType, "FOLLOW_UP_SCHEDULED");
  assert.equal("followUpAt" in scheduled, false);

  const cleared = mapMarketingEventToAutomationBridge(
    baseRecord({
      eventType: "FOLLOW_UP_CLEARED",
      metadata: { reason: "terminal_lead_status" }
    })
  );
  assert.ok(cleared);
  assert.equal(cleared.eventType, "FOLLOW_UP_CLEARED");
});
