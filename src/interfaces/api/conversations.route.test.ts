import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createConversationsGetHandler } from "../../../app/api/conversations/route.js";
import { CONVERSATION_LIST_DTO_KEYS } from "../../../src/interfaces/api/inboxDtos.js";
import { utcInboxFilterClock } from "../../../src/interfaces/api/conversationListInboxFilters.js";
import { buildDefaultTenantSlaPolicy } from "../../../src/domain/tenantSlaPolicy.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(search: Record<string, string> = {}): NextRequest {
  const url = new URL("http://local/api/conversations");
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  return new NextRequest(url, {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function bootstrapCapturingList() {
  let lastListInput: any = null;
  const sampleRow = {
    id: "c1",
    tenant_id: TENANT_ID,
    lead_id: "lead-1",
    contact_id: "contact-1",
    channel_type: "LINE",
    channel_thread_id: "thread-1",
    participant_display_name: "Test User",
    status: "OPEN",
    last_message_at: "2026-05-01T12:00:00.000Z",
    unread_count: 1,
    assigned_agent_id: null,
    assignment_status: "UNASSIGNED",
    priority: "NORMAL",
    sla_due_at: null,
    first_response_at: null,
    last_customer_message_at: "2026-05-01T11:00:00.000Z",
    last_agent_message_at: null,
    follow_up_at: null,
    follow_up_note: null,
    resolved_at: null,
    private_reply_sent_at: null,
    provider_thread_type: null,
    provider_external_user_id: "ext-1",
    provider_page_id: null,
    last_message_preview: "hello",
    last_message_type: "TEXT",
    leads: { status: "NEW", external_user_id: "ext-1" },
    contacts: {
      display_name: "Test User",
      profile_image_url: null,
      contact_identities: []
    }
  };
  return {
    get lastListInput() {
      return lastListInput;
    },
    apiBootstrap: () =>
      ({
        conversationRepository: {
          list: async (input: any) => {
            lastListInput = input;
            return {
              items: [sampleRow],
              nextCursor: "cursor-page-2"
            };
          }
        }
      }) as any,
    passthroughFilter(rows: any[]) {
      return rows;
    }
  };
}

test("invalid scope query returns 400", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "bogus" }));
  assert.equal(res.status, 400);
  assert.equal(cap.lastListInput, null);
});

test("MANAGER scope=all uses assignmentFilter none", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "all" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastListInput.assignmentFilter, "none");
});

test("MANAGER no scope uses assignmentFilter none", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastListInput.assignmentFilter, "none");
  assert.equal(cap.lastListInput.tenantId, TENANT_ID);
});

test("MANAGER scope=unassigned passes unassigned assignmentFilter", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "unassigned" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastListInput.assignmentFilter, "unassigned");
});

test("MANAGER scope=team passes team assignmentFilter", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "team" }));
  assert.equal(res.status, 200);
  assert.equal(cap.lastListInput.assignmentFilter, "team");
});

test("MANAGER scope=mine passes agent id", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "mine" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.assignmentFilter, { assignedToAgentId: AGENT_ID });
});

test("MANAGER scope=assigned_to_me alias maps to mine", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "assigned_to_me" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.assignmentFilter, { assignedToAgentId: AGENT_ID });
});

test("SALES no scope defaults to mine filter", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.assignmentFilter, { assignedToAgentId: AGENT_ID });
});

test("SALES scope=all returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "all" }));
  assert.equal(res.status, 403);
});

test("SALES scope=team returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "team" }));
  assert.equal(res.status, 403);
});

test("SALES missing salesAgentId returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10" }));
  assert.equal(res.status, 403);
});

test("MANAGER scope=mine without salesAgentId returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "mine" }));
  assert.equal(res.status, 403);
});

test("conversations list uses tenant from auth only", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ limit: "5" }));
  assert.equal(cap.lastListInput.tenantId, TENANT_ID);
});

test("conversationStatus and channel pass through with scope", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(
    makeReq({
      limit: "20",
      scope: "unassigned",
      conversationStatus: "OPEN",
      channel: "LINE"
    })
  );
  assert.equal(cap.lastListInput.status, "OPEN");
  assert.equal(cap.lastListInput.channel, "LINE");
  assert.equal(cap.lastListInput.assignmentFilter, "unassigned");
});

test("legacy status query still accepted", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ limit: "10", status: "RESOLVED" }));
  assert.equal(cap.lastListInput.status, "RESOLVED");
  await handler(makeReq({ limit: "10", status: "ARCHIVED" }));
  assert.equal(cap.lastListInput.status, "ARCHIVED");
  await handler(makeReq({ limit: "10", status: "CLOSED" }));
  assert.equal(cap.lastListInput.status, "CLOSED");
});

test("list response maps lean DTO and pageInfo with hasNextPage", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "25" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: Record<string, unknown>[];
    pageInfo: { nextCursor: string | null; hasNextPage: boolean };
  };
  assert.equal(body.pageInfo.nextCursor, "cursor-page-2");
  assert.equal(body.pageInfo.hasNextPage, true);
  assert.equal(body.data.length, 1);
  const keys = Object.keys(body.data[0] ?? {}).sort();
  assert.deepEqual(keys, [...CONVERSATION_LIST_DTO_KEYS].sort());
  assert.equal(body.data[0]?.lead_status, "NEW");
});

test("frozen inbox filters pass through to repository", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(
    makeReq({
      limit: "10",
      leadManagementStatus: "IN_PROGRESS",
      followUp: "today",
      sla: "overdue",
      waiting: "waiting_customer"
    })
  );
  assert.deepEqual(cap.lastListInput.inboxFilters, {
    leadManagementStatus: "IN_PROGRESS",
    followUp: "today",
    sla: "overdue",
    waiting: "waiting_customer"
  });
});

test("followUp none and sla none pass through to repository inboxFilters", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ limit: "10", followUp: "none", sla: "none" }));
  assert.deepEqual(cap.lastListInput.inboxFilters, { followUp: "none", sla: "none" });
});

test("legacy leadStatus followUp sla aliases map to frozen filters", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(
    makeReq({
      limit: "10",
      leadStatus: "CONTACTED",
      followUp: "has",
      sla: "has"
    })
  );
  assert.deepEqual(cap.lastListInput.inboxFilters, {
    leadManagementStatus: "IN_PROGRESS",
    followUp: "scheduled",
    sla: "active"
  });
});

test("assignedAgentId passes through to repository", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ limit: "10", assignedAgentId: AGENT_ID }));
  assert.equal(cap.lastListInput.assignedAgentId, AGENT_ID);
});

test("invalid leadManagementStatus query returns 400", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", leadManagementStatus: "BOGUS" }));
  assert.equal(res.status, 400);
  assert.equal(cap.lastListInput, null);
});

test("SALES can use inbox urgency filters within assigned scope", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", sla: "due_soon" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.assignmentFilter, { assignedToAgentId: AGENT_ID });
  assert.deepEqual(cap.lastListInput.inboxFilters, { sla: "due_soon" });
});

test("invalid conversationStatus query returns 400", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", conversationStatus: "BOGUS" }));
  assert.equal(res.status, 400);
  assert.equal(cap.lastListInput, null);
});

test("production action filter waiting=needs_response returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ limit: "25", scope: "all", waiting: "needs_response" })
  );
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { waiting: "needs_response" });
});

test("production action filter waiting=waiting_customer returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "25", scope: "all", waiting: "waiting_customer" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { waiting: "waiting_customer" });
});

test("production action filter sla=due_soon and waiting=needs_response returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ limit: "25", scope: "all", sla: "due_soon", waiting: "needs_response" })
  );
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { sla: "due_soon", waiting: "needs_response" });
});

test("production action filter sla=overdue and waiting=needs_response returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ limit: "25", scope: "all", sla: "overdue", waiting: "needs_response" })
  );
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { sla: "overdue", waiting: "needs_response" });
});

test("production action filter followUp=today and waiting=needs_response returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ limit: "25", scope: "all", followUp: "today", waiting: "needs_response" })
  );
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { followUp: "today", waiting: "needs_response" });
});

test("production action filter followUp=overdue and waiting=needs_response returns 200", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(
    makeReq({ limit: "25", scope: "all", followUp: "overdue", waiting: "needs_response" })
  );
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilters, { followUp: "overdue", waiting: "needs_response" });
});

test("GET /api/conversations passes tenant policy warning threshold as inboxFilterClock", async () => {
  const cap = bootstrapCapturingList();
  const frozenNow = new Date("2026-05-15T12:00:00.000Z");
  const policyClock = utcInboxFilterClock(frozenNow, 45);
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter,
    loadInboxSlaListContextForTenant: async () => ({
      inboxFilterClock: policyClock,
      warningBeforeBreachMinutes: 45
    })
  });
  const res = await handler(makeReq({ limit: "10", sla: "due_soon" }));
  assert.equal(res.status, 200);
  assert.deepEqual(cap.lastListInput.inboxFilterClock, policyClock);
  const json = (await res.json()) as { pageInfo: { slaWarningBeforeBreachMinutes?: number } };
  assert.equal(json.pageInfo.slaWarningBeforeBreachMinutes, 45);
});

test("GET /api/conversations default policy fallback when no tenant policy row", async () => {
  const cap = bootstrapCapturingList();
  const frozenNow = new Date("2026-05-15T12:00:00.000Z");
  const defaultMinutes = buildDefaultTenantSlaPolicy().warningBeforeBreachMinutes;
  const defaultClock = utcInboxFilterClock(frozenNow, defaultMinutes);
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter,
    loadInboxSlaListContextForTenant: async () => ({
      inboxFilterClock: defaultClock,
      warningBeforeBreachMinutes: defaultMinutes
    })
  });
  const res = await handler(makeReq({ limit: "10" }));
  assert.deepEqual(cap.lastListInput.inboxFilterClock, defaultClock);
  const json = (await res.json()) as { pageInfo: { slaWarningBeforeBreachMinutes?: number } };
  assert.equal(json.pageInfo.slaWarningBeforeBreachMinutes, defaultMinutes);
});
