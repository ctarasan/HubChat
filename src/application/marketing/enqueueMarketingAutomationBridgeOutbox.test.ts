import test from "node:test";
import assert from "node:assert/strict";
import type { MarketingEventRecord } from "../../domain/marketingEvents.js";
import {
  MARKETING_AUTOMATION_BRIDGE_FORBIDDEN_PAYLOAD_KEYS,
  bridgePayloadHasForbiddenKeys
} from "../../lib/marketingAutomationBridge.js";
import { EnqueueMarketingAutomationBridgeOutboxUseCase } from "./enqueueMarketingAutomationBridgeOutbox.js";
import type { MarketingAutomationBridgeOutboxRepository } from "../../domain/ports.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const EVENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LEAD_ID = "9e68eadd-01b6-4c66-a522-74b97d6a6902";
const CONVERSATION_ID = "d17bc402-7461-48fb-8b75-f2f3b02eb1b1";

function agentSentEvent(overrides: Partial<MarketingEventRecord> = {}): MarketingEventRecord {
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
    metadata: { messageId: "msg-1", messageType: "TEXT" },
    createdAt: "2026-05-26T10:00:01.000Z",
    ...overrides
  };
}

function mockRepo(
  impl: Partial<MarketingAutomationBridgeOutboxRepository> = {}
): MarketingAutomationBridgeOutboxRepository {
  return {
    enqueueFromMarketingEvent: async () => "enqueued",
    claimBatch: async () => [],
    markSent: async () => {},
    markFailed: async () => ({
      deadLetter: false,
      attemptCount: 1,
      nextAvailableAt: new Date().toISOString()
    }),
    ...impl
  };
}

test("supported marketing event enqueues one outbox row with mapped payload", async () => {
  let captured: Record<string, unknown> | undefined;
  const useCase = new EnqueueMarketingAutomationBridgeOutboxUseCase({
    marketingAutomationBridgeOutboxRepository: mockRepo({
      enqueueFromMarketingEvent: async (input) => {
        captured = input as Record<string, unknown>;
        return "enqueued";
      }
    })
  });

  const result = await useCase.execute({ marketingEvent: agentSentEvent() });
  assert.equal(result, "enqueued");
  assert.ok(captured);
  assert.equal(captured?.tenantId, TENANT_ID);
  assert.equal(captured?.marketingEventId, EVENT_ID);
  assert.equal(captured?.idempotencyKey, `marketing-bridge:${TENANT_ID}:${EVENT_ID}`);
  const payload = captured?.payloadJson as Record<string, unknown>;
  assert.equal(payload?.eventType, "AGENT_MESSAGE_SENT");
  assert.equal(payload?.messageType, "TEXT");
  assert.equal(payload?.schemaVersion, "1");
  assert.deepEqual(bridgePayloadHasForbiddenKeys(payload as any), []);
});

test("unsupported marketing event returns skipped without enqueue", async () => {
  let called = false;
  const useCase = new EnqueueMarketingAutomationBridgeOutboxUseCase({
    marketingAutomationBridgeOutboxRepository: mockRepo({
      enqueueFromMarketingEvent: async () => {
        called = true;
        return "enqueued";
      }
    })
  });

  const result = await useCase.execute({
    marketingEvent: agentSentEvent({ eventType: "LEAD_CREATED" })
  });
  assert.equal(result, "skipped");
  assert.equal(called, false);
});

test("duplicate enqueue result is surfaced from repository", async () => {
  const useCase = new EnqueueMarketingAutomationBridgeOutboxUseCase({
    marketingAutomationBridgeOutboxRepository: mockRepo({
      enqueueFromMarketingEvent: async () => "duplicate"
    })
  });
  assert.equal(await useCase.execute({ marketingEvent: agentSentEvent() }), "duplicate");
});

test("image AGENT_MESSAGE_SENT maps messageType without mediaUrl in payload_json", async () => {
  let payload: Record<string, unknown> | undefined;
  const useCase = new EnqueueMarketingAutomationBridgeOutboxUseCase({
    marketingAutomationBridgeOutboxRepository: mockRepo({
      enqueueFromMarketingEvent: async (input) => {
        payload = input.payloadJson as Record<string, unknown>;
        return "enqueued";
      }
    })
  });

  await useCase.execute({
    marketingEvent: agentSentEvent({
      metadata: {
        messageId: "msg-img",
        messageType: "IMAGE",
        mediaUrl: "https://signed.example/x",
        content: "secret body"
      }
    })
  });

  assert.ok(payload);
  assert.equal(payload?.messageType, "IMAGE");
  for (const key of [
    "content",
    "body",
    "text",
    "mediaUrl",
    "signedUrl",
    "accessToken",
    "channelSecret",
    "webhookPayload",
    "rawPayload"
  ]) {
    assert.equal(key in payload!, false, `forbidden key ${key} leaked`);
  }
});

test("payload_json does not include forbidden keys from metadata", async () => {
  let payload: Record<string, unknown> | undefined;
  const useCase = new EnqueueMarketingAutomationBridgeOutboxUseCase({
    marketingAutomationBridgeOutboxRepository: mockRepo({
      enqueueFromMarketingEvent: async (input) => {
        payload = input.payloadJson as Record<string, unknown>;
        return "enqueued";
      }
    })
  });

  await useCase.execute({
    marketingEvent: agentSentEvent({
      metadata: {
        messageId: "m1",
        messageType: "TEXT",
        content: "hello",
        body: "hello",
        accessToken: "tok",
        webhookPayload: { x: 1 }
      }
    })
  });

  assert.ok(payload);
  assert.deepEqual(bridgePayloadHasForbiddenKeys(payload as any), []);
  for (const key of MARKETING_AUTOMATION_BRIDGE_FORBIDDEN_PAYLOAD_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, `forbidden key ${key}`);
  }
});
