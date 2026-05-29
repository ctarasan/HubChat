import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createLeadsGetHandler } from "../../../app/api/leads/route.js";
import { LEADS_LIST_ITEM_DTO_KEYS } from "./leadsListDtos.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makeReq(search: Record<string, string> = {}): NextRequest {
  const url = new URL("http://local/api/leads");
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  return new NextRequest(url, {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    tenant_id: TENANT_ID,
    lead_id: "lead-1",
    channel_type: "INSTAGRAM",
    status: "OPEN",
    participant_display_name: "Customer",
    participant_profile_image_url: null,
    last_message_at: "2026-05-29T10:00:00.000Z",
    last_message_preview: "preview",
    follow_up_at: "2026-05-28T00:00:00.000Z",
    sla_due_at: "2026-05-28T00:00:00.000Z",
    assigned_agent_id: AGENT_SELF,
    leads: { status: "QUALIFIED", created_at: "2026-05-29T09:00:00.000Z" },
    sales_agents: { id: AGENT_SELF, name: "Sales One" },
    provider_external_user_id: "ext-1",
    provider_page_id: null,
    ...overrides
  };
}

function bootstrap() {
  let lastInput: any = null;
  const rows = [sampleRow(), sampleRow({ id: "conv-2", lead_id: "lead-2" })];
  return {
    get lastInput() {
      return lastInput;
    },
    apiBootstrap: () =>
      ({
        conversationRepository: {
          listForLeadsMenu: async (input: unknown) => {
            lastInput = input;
            return { items: rows, nextCursor: "cursor-page-2" };
          }
        }
      }) as any,
    passthroughFilter(items: unknown[]) {
      return items;
    }
  };
}

test("GET /api/leads 200 for ADMIN with lean DTO", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "a@x.com",
        role: "ADMIN",
        salesAgentId: AGENT_OTHER
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "25" }));
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: Record<string, unknown>[]; pageInfo: { nextCursor: string } };
  assert.equal(json.data.length, 2);
  assert.equal(json.pageInfo.nextCursor, "cursor-page-2");
  assert.deepEqual(Object.keys(json.data[0] ?? {}).sort(), [...LEADS_LIST_ITEM_DTO_KEYS].sort());
  assert.equal(json.data[0]?.leadStatus, "QUALIFIED");
  assert.equal(cap.lastInput.tenantId, TENANT_ID);
  assert.equal(cap.lastInput.assignmentFilter, "none");
});

test("GET /api/leads MANAGER passes tenant-wide filter", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({}));
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.assignmentFilter, "none");
});

test("GET /api/leads SALES uses assigned agent filter", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({}));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastInput.assignmentFilter, { assignedToAgentId: AGENT_SELF });
});

test("GET /api/leads SALES owner=unassigned returns 403", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ owner: "unassigned" }));
  assert.equal(res.status, 403);
});

test("GET /api/leads owner=me resolves to assigned agent", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ owner: "me" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastInput.assignmentFilter, { assignedToAgentId: AGENT_SELF });
});

test("GET /api/leads owner=unassigned filter", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ owner: "unassigned" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.assignmentFilter, "unassigned");
});

test("GET /api/leads filter status QUALIFIED and channel", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ status: "QUALIFIED", channel: "INSTAGRAM", followUp: "overdue", sla: "overdue" })
  );
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.leadStatus, "QUALIFIED");
  assert.equal(cap.lastInput.channel, "INSTAGRAM");
  assert.equal(cap.lastInput.inboxFilters?.followUp, "overdue");
  assert.equal(cap.lastInput.inboxFilters?.sla, "overdue");
});

test("GET /api/leads passes search and limit cap", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ search: "test", limit: "99" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.search, "test");
  assert.equal(cap.lastInput.limit, 50);
});

test("GET /api/leads default limit is 25", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({}));
  assert.equal(cap.lastInput.limit, 25);
});

test("GET /api/leads cursor pagination forwards cursor", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ cursor: "abc123" }));
  assert.equal(cap.lastInput.cursor, "abc123");
});

test("GET /api/leads invalid filter returns 400", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ status: "NOT_A_STATUS" }));
  assert.equal(res.status, 400);
});

test("GET /api/leads search=Poolsub returns 200", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ search: "Poolsub" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.search, "Poolsub");
});

test("GET /api/leads search with special characters returns 200", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  for (const term of ["user_1", "111", "test,value", "test(value)", "50%", "O'Brien"]) {
    const res = await handler(makeReq({ search: term }));
    assert.equal(res.status, 200, `search=${term}`);
  }
});

test("GET /api/leads search combines with cursor and status filter", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ search: "Poolsub", cursor: "cursor-2", status: "QUALIFIED", channel: "LINE" })
  );
  assert.equal(res.status, 200);
  assert.equal(cap.lastInput.search, "Poolsub");
  assert.equal(cap.lastInput.cursor, "cursor-2");
  assert.equal(cap.lastInput.leadStatus, "QUALIFIED");
});

test("GET /api/leads response excludes secrets", async () => {
  const cap = bootstrap();
  const handler = createLeadsGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "u",
        email: "m@x.com",
        role: "ADMIN",
        salesAgentId: AGENT_SELF
      }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({}));
  const text = await res.text();
  assert.equal(text.includes("access_token"), false);
  assert.equal(text.includes("secret_json"), false);
  assert.equal(text.includes("payload_json"), false);
});
