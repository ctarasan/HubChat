import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseMarketingEventRepository } from "./supabaseMarketingEventRepository.js";
import { encodeRepoCursor } from "./cursorPagination.js";

test("insert maps columns without message content", async () => {
  let captured: Record<string, unknown> | undefined;
  const supabase = {
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        captured = payload as Record<string, unknown>;
        return Promise.resolve({ error: null });
      }
    })
  } as any;

  const repo = new SupabaseMarketingEventRepository(supabase);
  const occurredAt = new Date("2026-05-19T12:00:00.000Z");
  await repo.insert({
    tenantId: "tenant-1",
    leadId: "lead-1",
    conversationId: "conv-1",
    channel: "LINE",
    eventType: "CUSTOMER_MESSAGE_RECEIVED",
    occurredAt,
    actorType: "CUSTOMER",
    metadata: { messageType: "TEXT", externalMessageId: "ext-1" }
  });

  assert.ok(captured);
  assert.equal(captured?.tenant_id, "tenant-1");
  assert.equal(captured?.event_type, "CUSTOMER_MESSAGE_RECEIVED");
  assert.equal(captured?.occurred_at, occurredAt.toISOString());
  assert.deepEqual(captured?.metadata_json, { messageType: "TEXT", externalMessageId: "ext-1" });
  assert.equal("content" in (captured ?? {}), false);
});

test("list applies tenant filters and returns nextCursor", async () => {
  const rows = [
    {
      id: "e2",
      tenant_id: "tenant-1",
      lead_id: "lead-1",
      conversation_id: "conv-1",
      channel: "LINE",
      event_type: "LEAD_STATUS_CHANGED",
      occurred_at: "2026-05-19T11:00:00.000Z",
      actor_type: "AGENT",
      actor_user_id: null,
      metadata_json: { from: "NEW", to: "CONTACTED" },
      created_at: "2026-05-19T11:00:01.000Z"
    },
    {
      id: "e1",
      tenant_id: "tenant-1",
      lead_id: "lead-1",
      conversation_id: "conv-1",
      channel: "LINE",
      event_type: "CONVERSATION_CREATED",
      occurred_at: "2026-05-19T10:00:00.000Z",
      actor_type: "CUSTOMER",
      actor_user_id: null,
      metadata_json: {},
      created_at: "2026-05-19T10:00:01.000Z"
    },
    {
      id: "e0",
      tenant_id: "tenant-1",
      lead_id: "lead-1",
      conversation_id: "conv-1",
      channel: "LINE",
      event_type: "LEAD_CREATED",
      occurred_at: "2026-05-19T09:00:00.000Z",
      actor_type: "CUSTOMER",
      actor_user_id: null,
      metadata_json: {},
      created_at: "2026-05-19T09:00:01.000Z"
    }
  ];

  let eqLeadId: string | undefined;
  const supabase = {
    from: (_table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain as any;
      chain.select = () => self();
      chain.eq = (_col: string, val: string) => {
        if (_col === "lead_id") eqLeadId = val;
        return self();
      };
      chain.order = () => self();
      chain.limit = () => self();
      chain.or = () => self();
      chain.then = (resolve: (v: unknown) => void) => {
        resolve({ data: rows, error: null });
        return Promise.resolve({ data: rows, error: null });
      };
      return chain;
    }
  } as any;

  const repo = new SupabaseMarketingEventRepository(supabase);
  const page1 = await repo.list({ tenantId: "tenant-1", leadId: "lead-1", limit: 2 });
  assert.equal(eqLeadId, "lead-1");
  assert.equal(page1.items.length, 2);
  assert.equal(page1.items[0]?.eventType, "LEAD_STATUS_CHANGED");
  assert.ok(page1.nextCursor);

  const cursor = page1.nextCursor!;
  let usedOr = false;
  const supabase2 = {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain as any;
      chain.select = () => self();
      chain.eq = () => self();
      chain.order = () => self();
      chain.limit = () => self();
      chain.or = () => {
        usedOr = true;
        return self();
      };
      chain.then = (resolve: (v: unknown) => void) => {
        resolve({ data: [rows[2]], error: null });
        return Promise.resolve({ data: [rows[2]], error: null });
      };
      return chain;
    }
  } as any;

  const repo2 = new SupabaseMarketingEventRepository(supabase2);
  const page2 = await repo2.list({
    tenantId: "tenant-1",
    leadId: "lead-1",
    limit: 2,
    cursor
  });
  assert.equal(usedOr, true);
  assert.equal(page2.items.length, 1);
  assert.equal(page2.nextCursor, null);
  assert.equal(encodeRepoCursor({ occurredAt: "x", id: "y" }).length > 0, true);
});
