import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseMarketingAutomationBridgeOutboxRepository } from "./supabaseMarketingAutomationBridgeOutboxRepository.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const EVENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const OUTBOX_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const bridgePayload = {
  schemaVersion: "1" as const,
  source: "hubchat" as const,
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  eventType: "AGENT_MESSAGE_SENT" as const,
  occurredAt: "2026-05-26T10:00:00.000Z",
  channel: "LINE" as const,
  conversationId: "conv-1",
  contactId: "lead-1",
  messageId: "msg-1",
  messageType: "TEXT",
  leadStatus: null,
  conversationStatus: null
};

test("enqueueFromMarketingEvent inserts mapped payload only", async () => {
  let captured: Record<string, unknown> | undefined;
  const supabase = {
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        captured = payload;
        return {
          select: () => Promise.resolve({ data: [{ id: OUTBOX_ID }], error: null })
        };
      }
    })
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase);
  const result = await repo.enqueueFromMarketingEvent({
    tenantId: TENANT_ID,
    marketingEventId: EVENT_ID,
    eventType: "AGENT_MESSAGE_SENT",
    schemaVersion: "1",
    payloadJson: bridgePayload,
    idempotencyKey: `marketing-bridge:${TENANT_ID}:${EVENT_ID}`
  });

  assert.equal(result, "enqueued");
  assert.equal(captured?.tenant_id, TENANT_ID);
  assert.equal(captured?.marketing_event_id, EVENT_ID);
  assert.deepEqual(captured?.payload_json, bridgePayload);
  assert.equal("metadata_json" in (captured ?? {}), false);
});

test("enqueueFromMarketingEvent returns duplicate on unique violation", async () => {
  const supabase = {
    from: () => ({
      insert: () => ({
        select: () =>
          Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" }
          })
      })
    })
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase);
  const result = await repo.enqueueFromMarketingEvent({
    tenantId: TENANT_ID,
    marketingEventId: EVENT_ID,
    eventType: "AGENT_MESSAGE_SENT",
    schemaVersion: "1",
    payloadJson: bridgePayload,
    idempotencyKey: `marketing-bridge:${TENANT_ID}:${EVENT_ID}`
  });
  assert.equal(result, "duplicate");
});

test("claimBatch maps RPC rows", async () => {
  const rpcRow = {
    id: OUTBOX_ID,
    tenant_id: TENANT_ID,
    marketing_event_id: EVENT_ID,
    event_type: "AGENT_MESSAGE_SENT",
    payload_json: bridgePayload,
    schema_version: "1",
    status: "PROCESSING",
    available_at: "2026-05-26T10:00:00.000Z",
    attempt_count: 1,
    max_attempts: 25,
    last_error: null,
    idempotency_key: `marketing-bridge:${TENANT_ID}:${EVENT_ID}`,
    created_at: "2026-05-26T10:00:00.000Z",
    updated_at: "2026-05-26T10:00:01.000Z",
    sent_at: null
  };

  let rpcArgs: Record<string, unknown> | undefined;
  const supabase = {
    rpc: (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "claim_marketing_automation_bridge_outbox");
      rpcArgs = args;
      return Promise.resolve({ data: [rpcRow], error: null });
    }
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase, 90);
  const claimed = await repo.claimBatch({ limit: 10, processingTimeoutSeconds: 90 });
  assert.equal(rpcArgs?.p_limit, 10);
  assert.equal(rpcArgs?.p_processing_timeout_seconds, 90);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.id, OUTBOX_ID);
  assert.equal(claimed[0]?.status, "PROCESSING");
  assert.equal(claimed[0]?.attemptCount, 1);
  assert.deepEqual(claimed[0]?.payloadJson, bridgePayload);
});

test("markSent sets SENT and sent_at", async () => {
  let updatePayload: Record<string, unknown> | undefined;
  const supabase = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return {
          eq: () => Promise.resolve({ error: null })
        };
      }
    })
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase);
  await repo.markSent(OUTBOX_ID);
  assert.equal(updatePayload?.status, "SENT");
  assert.ok(updatePayload?.sent_at);
  assert.ok(updatePayload?.updated_at);
  assert.equal(updatePayload?.last_error, null);
});

test("markFailed dead-letters when attemptCount >= maxAttempts", async () => {
  let updatePayload: Record<string, unknown> | undefined;
  const supabase = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return {
          eq: () => Promise.resolve({ error: null })
        };
      }
    })
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase);
  const result = await repo.markFailed(OUTBOX_ID, {
    attemptCount: 25,
    maxAttempts: 25,
    error: new Error("cdp down")
  });
  assert.equal(result.deadLetter, true);
  assert.equal(updatePayload?.status, "DEAD_LETTER");
  assert.ok(String(updatePayload?.last_error).includes("cdp down"));
});

test("markFailed retries with backoff when under maxAttempts", async () => {
  let updatePayload: Record<string, unknown> | undefined;
  const supabase = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return {
          eq: () => Promise.resolve({ error: null })
        };
      }
    })
  } as any;

  const repo = new SupabaseMarketingAutomationBridgeOutboxRepository(supabase);
  const result = await repo.markFailed(OUTBOX_ID, {
    attemptCount: 2,
    maxAttempts: 25,
    error: "temporary"
  });
  assert.equal(result.deadLetter, false);
  assert.equal(updatePayload?.status, "PENDING");
  assert.ok(updatePayload?.available_at);
});
