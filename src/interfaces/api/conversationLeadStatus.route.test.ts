import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createConversationLeadStatusPatchHandler,
  mapConversationLeadStatusRouteError
} from "../../../app/api/conversations/[id]/lead-status/route.js";
import type { LeadStatus } from "../../domain/entities.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest(`http://local/api/conversations/${CONV_ID}/lead-status`, {
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
    followUpAt: new Date("2026-05-10T00:00:00.000Z") as Date | null,
    followUpNote: "note" as string | null
  };
}

function baseLead(status: LeadStatus = "CONTACTED") {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    sourceChannel: "LINE" as const,
    externalUserId: "u1",
    name: null,
    phone: null,
    email: null,
    status,
    assignedSalesId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastContactAt: null,
    tags: [] as string[]
  };
}

function bootstrap(opts: {
  row?: ReturnType<typeof baseRow> | null;
  lead?: ReturnType<typeof baseLead> | null;
}) {
  const leadPatches: unknown[] = [];
  const followUpPatches: unknown[] = [];
  const events: unknown[] = [];
  const row = opts.row === undefined ? baseRow() : opts.row;
  const lead = opts.lead === undefined ? baseLead() : opts.lead;

  return {
    leadPatches,
    followUpPatches,
    events,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (tenantId: string, conversationId: string) => {
            if (!row || tenantId !== TENANT_ID || conversationId !== CONV_ID) return null;
            return { ...row };
          },
          updateConversationFollowUp: async (input: unknown) => {
            followUpPatches.push(input);
          }
        },
        leadRepository: {
          findById: async (tenantId: string, leadId: string) => {
            if (!lead || tenantId !== TENANT_ID || leadId !== LEAD_ID) return null;
            return { ...lead };
          },
          patch: async (tenantId: string, leadId: string, patch: unknown) => {
            if (tenantId !== TENANT_ID || leadId !== LEAD_ID) throw new Error("cross-tenant lead patch");
            leadPatches.push({ tenantId, leadId, patch });
          }
        },
        conversationEventRepository: {
          create: async (input: unknown) => {
            events.push(input);
          }
        },
        activityLogRepository: {
          create: async () => {}
        }
      }) as any
  };
}

test("PATCH lead-status 200 for ADMIN and inserts CONVERSATION_LEAD_STATUS_CHANGED", async () => {
  const cap = bootstrap({});
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "a@x.com",
        role: "ADMIN",
        salesAgentId: AGENT_OTHER
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "WON" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { leadStatus: string; followUpAt: string | null } };
  assert.equal(json.data.leadStatus, "WON");
  assert.equal(json.data.followUpAt, null);
  assert.equal(cap.leadPatches.length, 1);
  assert.equal(cap.followUpPatches.length, 1);
  assert.equal((cap.events[0] as { eventType: string }).eventType, "CONVERSATION_LEAD_STATUS_CHANGED");
});

test("PATCH lead-status 200 for MANAGER", async () => {
  const cap = bootstrap({ lead: baseLead("NEW") });
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "IN_PROGRESS" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.leadPatches.length, 1);
});

test("PATCH 200 when SALES is assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_SELF } });
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "LOST" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
});

test("PATCH 403 when SALES not assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_OTHER } });
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "WON" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 403);
  assert.equal(cap.leadPatches.length, 0);
});

test("PATCH rejects invalid leadStatus enum", async () => {
  const cap = bootstrap({});
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "INVALID" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 400);
});

test("PATCH rejects empty body", async () => {
  const cap = bootstrap({});
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({}), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 400);
});

test("PATCH rejects unknown keys (strict body)", async () => {
  const cap = bootstrap({});
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makePatchReq({ leadStatus: "WON", extra: true }),
    { params: Promise.resolve({ id: CONV_ID }) }
  );
  assert.equal(res.status, 400);
});

test("PATCH 404 when conversation not in tenant", async () => {
  const cap = bootstrap({ row: null });
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "WON" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 404);
});

test("PATCH CLOSED clears follow_up_at", async () => {
  const cap = bootstrap({});
  const handler = createConversationLeadStatusPatchHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ leadStatus: "CLOSED" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.followUpPatches.length, 1);
  assert.equal((cap.followUpPatches[0] as { patch: { followUpAt: null } }).patch.followUpAt, null);
});

test("PATCH maps invalid enum db error to 400", () => {
  const err = new Error('invalid input value for enum lead_status: "BAD"') as Error & { code: string };
  err.code = "22P02";
  const res = mapConversationLeadStatusRouteError(err);
  assert.equal(res.status, 400);
});

test("PATCH maps conversation_events failure after update to 503", () => {
  const res = mapConversationLeadStatusRouteError(
    new Error("conversation_events insert failed after lead status update: relation does not exist")
  );
  assert.equal(res.status, 503);
});
