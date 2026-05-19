import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createConversationStatusPatchHandler,
  mapConversationStatusRouteError
} from "../../../app/api/conversations/[id]/status/route.js";
import type { ConversationStatus } from "../../domain/entities.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest(`http://local/api/conversations/${CONV_ID}/status`, {
    method: "PATCH",
    headers: new Headers({ "Content-Type": "application/json", Authorization: "Bearer t" }),
    body: JSON.stringify(body)
  });
}

function baseRow() {
  return {
    id: CONV_ID,
    tenantId: TENANT_ID,
    leadId: LEAD_ID,
    channelType: "LINE" as const,
    channelThreadId: "t1",
    status: "OPEN" as ConversationStatus,
    lastMessageAt: new Date(),
    assignedAgentId: null as string | null,
    resolvedAt: null as Date | null
  };
}

function bootstrap(opts: { row?: ReturnType<typeof baseRow> | null; forbidUpdate?: boolean }) {
  const updates: unknown[] = [];
  const events: unknown[] = [];
  const row = opts.row === undefined ? baseRow() : opts.row;

  return {
    updates,
    events,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (tenantId: string, conversationId: string) => {
            if (!row || tenantId !== TENANT_ID || conversationId !== CONV_ID) return null;
            return { ...row };
          },
          updateConversationStatus: async (input: unknown) => {
            if (opts.forbidUpdate) throw new Error("db failure");
            updates.push(input);
          }
        },
        conversationEventRepository: {
          create: async (input: unknown) => {
            events.push(input);
          }
        }
      }) as any
  };
}

test("PATCH status 200 for MANAGER and inserts CONVERSATION_STATUS_CHANGED", async () => {
  const cap = bootstrap({});
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "00000000-0000-4000-8000-000000000001", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_OTHER }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "RESOLVED" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.updates.length, 1);
  assert.equal(cap.events.length, 1);
  assert.equal((cap.events[0] as any).eventType, "CONVERSATION_STATUS_CHANGED");
  assert.deepEqual((cap.events[0] as any).oldValue, { status: "OPEN" });
  assert.deepEqual((cap.events[0] as any).newValue, { status: "RESOLVED" });
});

test("PATCH rejects CLOSED body (not in writable schema)", async () => {
  const cap = bootstrap({});
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "CLOSED" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 400);
  assert.equal(cap.updates.length, 0);
});

test("PATCH 403 when SALES not assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_OTHER } });
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "PENDING" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 403);
  assert.equal(cap.updates.length, 0);
});

test("PATCH 200 when SALES is assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_SELF } });
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "PENDING" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.updates.length, 1);
});

test("PATCH 200 when assigned SALES sets OPEN to RESOLVED with resolved_at", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_SELF } });
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "RESOLVED" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.updates.length, 1);
  const update = cap.updates[0] as { status: string; resolvedAtIso: string | null };
  assert.equal(update.status, "RESOLVED");
  assert.ok(update.resolvedAtIso);
  assert.equal(cap.events.length, 1);
});

test("PATCH 200 when assigned SALES reopens RESOLVED to OPEN and clears resolved_at", async () => {
  const cap = bootstrap({
    row: {
      ...baseRow(),
      assignedAgentId: AGENT_SELF,
      status: "RESOLVED" as ConversationStatus,
      resolvedAt: new Date("2026-05-01T00:00:00.000Z")
    }
  });
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "OPEN" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  const update = cap.updates[0] as { status: string; resolvedAtIso: string | null };
  assert.equal(update.status, "OPEN");
  assert.equal(update.resolvedAtIso, null);
});

test("PATCH maps missing resolved_at column to 503 not 500", async () => {
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (tenantId: string, conversationId: string) => {
            if (tenantId !== TENANT_ID || conversationId !== CONV_ID) return null;
            return { ...baseRow(), assignedAgentId: AGENT_SELF };
          },
          updateConversationStatus: async () => {
            const err = new Error(
              "Could not find the 'resolved_at' column of 'conversations' in the schema cache"
            ) as Error & { code: string };
            err.code = "PGRST204";
            throw err;
          }
        },
        conversationEventRepository: {
          create: async () => {}
        }
      }) as any
  });
  const res = await handler(makePatchReq({ status: "RESOLVED" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /schema/i);
});

test("PATCH maps invalid enum to 400", () => {
  const err = new Error('invalid input value for enum conversation_status: "RESOLVED"') as Error & { code: string };
  err.code = "22P02";
  const res = mapConversationStatusRouteError(err);
  assert.equal(res.status, 400);
});

test("PATCH maps conversation_events failure after update to 503", () => {
  const res = mapConversationStatusRouteError(
    new Error("conversation_events insert failed after status update: relation does not exist")
  );
  assert.equal(res.status, 503);
});

test("PATCH 404 when conversation not in tenant", async () => {
  const cap = bootstrap({ row: null });
  const handler = createConversationStatusPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ status: "OPEN" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 404);
});
