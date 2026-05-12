import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createConversationStatusPatchHandler } from "../../../app/api/conversations/[id]/status/route.js";

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
    status: "OPEN" as const,
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
