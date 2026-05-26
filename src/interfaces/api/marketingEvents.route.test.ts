import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createMarketingEventsGetHandler } from "../../../app/api/marketing-events/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makeGetReq(query: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(query).toString();
  return new NextRequest(`http://local/api/marketing-events?${qs}`, {
    method: "GET",
    headers: new Headers({ Authorization: "Bearer t" })
  });
}

function bootstrap(opts: {
  assignedAgentId?: string | null;
  leadAssigned?: string | null;
  events?: unknown[];
}) {
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
            if (tenantId !== TENANT_ID || conversationId !== CONV_ID) return null;
            return {
              id: CONV_ID,
              tenantId: TENANT_ID,
              leadId: LEAD_ID,
              channelType: "LINE",
              assignedAgentId:
                "assignedAgentId" in opts ? (opts.assignedAgentId ?? null) : AGENT_SELF
            };
          }
        },
        leadRepository: {
          findById: async (tenantId: string, leadId: string) => {
            if (tenantId !== TENANT_ID || leadId !== LEAD_ID) return null;
            return {
              id: LEAD_ID,
              tenantId: TENANT_ID,
              assignedSalesId: "leadAssigned" in opts ? (opts.leadAssigned ?? null) : AGENT_SELF
            };
          }
        }
      }) as any
  };
}

test("GET marketing-events 200 for MANAGER with conversationId filter", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_OTHER
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: unknown[]; pageInfo: { hasNextPage: boolean } };
  assert.equal(body.data.length, 1);
  assert.equal(body.pageInfo.hasNextPage, false);
});

test("GET marketing-events 403 for SALES without scope", async () => {
  const cap = bootstrap({});
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({}));
  assert.equal(res.status, 403);
});

test("GET marketing-events 403 for SALES on unassigned conversation", async () => {
  const cap = bootstrap({ assignedAgentId: null });
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID }));
  assert.equal(res.status, 403);
});

test("GET marketing-events 200 for SALES on assigned conversation", async () => {
  const cap = bootstrap({ assignedAgentId: AGENT_SELF });
  const handler = createMarketingEventsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq({ conversationId: CONV_ID, eventType: "LEAD_STATUS_CHANGED" }));
  assert.equal(res.status, 200);
});
