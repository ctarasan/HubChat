import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createMarketingEventsGetHandler } from "../../../app/api/marketing-events/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT_ID = "ca82d847-53cd-4b60-9e4d-5fd3f8ad8650";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const CONV_OTHER = "4b241101-e2bb-4955-9933-fd6a836e82f9";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const LEAD_OTHER = "7b241101-e2bb-4955-9933-fd6a836e82fc";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

type ConvFixture = { leadId: string; assignedAgentId: string | null; tenantId?: string };
type LeadFixture = { assignedSalesId: string | null; tenantId?: string };

function makeGetReq(query: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(query).toString();
  return new NextRequest(`http://local/api/marketing-events?${qs}`, {
    method: "GET",
    headers: new Headers({ Authorization: "Bearer t" })
  });
}

function bootstrap(opts: {
  conversations?: Record<string, ConvFixture>;
  leads?: Record<string, LeadFixture>;
  events?: unknown[];
}) {
  const conversations: Record<string, ConvFixture> = {
    [CONV_ID]: { leadId: LEAD_ID, assignedAgentId: AGENT_SELF },
    [CONV_OTHER]: { leadId: LEAD_OTHER, assignedAgentId: AGENT_SELF },
    ...(opts.conversations ?? {})
  };
  const leads: Record<string, LeadFixture> = {
    [LEAD_ID]: { assignedSalesId: AGENT_SELF },
    [LEAD_OTHER]: { assignedSalesId: AGENT_OTHER },
    ...(opts.leads ?? {})
  };
  const events = opts.events ?? [
    {
      id: "ev-1",
      tenantId: TENANT_ID,
      leadId: LEAD_ID,
      conversationId: CONV_ID,
      channel: "LINE",
      eventType: "LEAD_STATUS_CHANGED",
      occurredAt: "2026-05-19T10:00:00.000Z",
      actorType: "AGENT",
      actorUserId: null,
      metadata: { from: "NEW", to: "CONTACTED" },
      createdAt: "2026-05-19T10:00:01.000Z"
    }
  ];

  return {
    apiBootstrap: () =>
      ({
        marketingEventRepository: {
          list: async () => ({ items: events, nextCursor: null })
        },
        conversationRepository: {
          findById: async (tenantId: string, conversationId: string) => {
            const row = conversations[conversationId];
            if (!row || (row.tenantId ?? TENANT_ID) !== tenantId) return null;
            return {
              id: conversationId,
              tenantId,
              leadId: row.leadId,
              channelType: "LINE",
              assignedAgentId: row.assignedAgentId
            };
          }
        },
        leadRepository: {
          findById: async (tenantId: string, leadId: string) => {
            const row = leads[leadId];
            if (!row || (row.tenantId ?? TENANT_ID) !== tenantId) return null;
            return {
              id: leadId,
              tenantId,
              assignedSalesId: row.assignedSalesId
            };
          }
        }
      }) as any
  };
}

function salesAuth() {
  return {
    tenantId: TENANT_ID,
    userId: "00000000-0000-4000-8000-000000000002",
    email: "s@x.com",
    role: "SALES",
    salesAgentId: AGENT_SELF
  } as const;
}

function managerAuth() {
  return {
    tenantId: TENANT_ID,
    userId: "00000000-0000-4000-8000-000000000001",
    email: "m@x.com",
    role: "MANAGER",
    salesAgentId: AGENT_OTHER
  } as const;
}

test("GET marketing-events 200 for MANAGER with conversationId filter", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => managerAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 200);
});

test("GET marketing-events 403 for SALES without scope", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({}));
  assert.equal(res.status, 403);
});

test("GET marketing-events 403 for SALES on unassigned conversation", async () => {
  const cap = bootstrap({
    conversations: { [CONV_ID]: { leadId: LEAD_ID, assignedAgentId: null } }
  });
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 403);
});

test("GET marketing-events 200 for SALES on assigned conversation only", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 200);
});

test("GET marketing-events 403 for SALES with allowed conversationId and forbidden leadId", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makeGetReq({ conversationId: CONV_ID, leadId: LEAD_OTHER })
  );
  assert.equal(res.status, 403);
});

test("GET marketing-events 200 for SALES with allowed leadId and conversationId pair", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID, leadId: LEAD_ID }));
  assert.equal(res.status, 200);
});

test("GET marketing-events 403 for SALES with allowed leadId and conversationId but mismatched pair", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makeGetReq({ conversationId: CONV_OTHER, leadId: LEAD_ID })
  );
  assert.equal(res.status, 403);
});

test("GET marketing-events 200 for SALES with leadId only when assigned", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ leadId: LEAD_ID }));
  assert.equal(res.status, 200);
});

test("GET marketing-events 403 for SALES with leadId only when unassigned", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => salesAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ leadId: LEAD_OTHER }));
  assert.equal(res.status, 403);
});

test("GET marketing-events 403 for MANAGER when leadId and conversationId mismatch", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => managerAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makeGetReq({ conversationId: CONV_OTHER, leadId: LEAD_ID })
  );
  assert.equal(res.status, 403);
});

test("GET marketing-events 200 for MANAGER when leadId and conversationId match", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => managerAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID, leadId: LEAD_ID }));
  assert.equal(res.status, 200);
});

test("GET marketing-events 404 for cross-tenant conversation", async () => {
  const cap = bootstrap({
    conversations: {
      [CONV_ID]: { leadId: LEAD_ID, assignedAgentId: AGENT_SELF, tenantId: OTHER_TENANT_ID }
    }
  });
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => managerAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 404);
});

test("GET marketing-events 404 for cross-tenant lead", async () => {
  const cap = bootstrap({
    leads: {
      [LEAD_ID]: { assignedSalesId: AGENT_SELF, tenantId: OTHER_TENANT_ID }
    }
  });
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () => managerAuth() as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ leadId: LEAD_ID }));
  assert.equal(res.status, 404);
});
