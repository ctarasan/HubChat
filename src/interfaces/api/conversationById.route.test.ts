import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createConversationByIdGetHandler } from "../../../app/api/conversations/[id]/route.js";
import { CONVERSATION_LIST_DTO_KEYS } from "./inboxDtos.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AGENT_ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_ID = "0f1e2d3c-4b5a-4978-a123-456789abcdef";

function makeReq(): NextRequest {
  return new NextRequest(new URL(`http://local/api/conversations/${CONVERSATION_ID}`), {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function params(id: string = CONVERSATION_ID) {
  return { params: Promise.resolve({ id }) };
}

function sampleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONVERSATION_ID,
    tenant_id: TENANT_ID,
    lead_id: "lead-1",
    contact_id: "contact-1",
    channel_type: "LINE",
    channel_thread_id: "thread-1",
    participant_display_name: "Test User",
    status: "OPEN",
    last_message_at: "2026-06-01T12:00:00.000Z",
    unread_count: 1,
    assigned_agent_id: null,
    assignment_status: "UNASSIGNED",
    priority: "NORMAL",
    sla_due_at: null,
    first_response_at: null,
    last_customer_message_at: "2026-06-01T11:00:00.000Z",
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
    contacts: { display_name: "Test User", profile_image_url: null, contact_identities: [] },
    ...overrides
  };
}

function capturingBootstrap(row: Record<string, unknown> | null) {
  let lastTenantId: string | null = null;
  let lastConversationId: string | null = null;
  return {
    get lastTenantId() {
      return lastTenantId;
    },
    get lastConversationId() {
      return lastConversationId;
    },
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findInboxListItemById: async (tenantId: string, conversationId: string) => {
            lastTenantId = tenantId;
            lastConversationId = conversationId;
            return row;
          }
        }
      }) as any,
    passthroughFilter(rows: any[]) {
      return rows;
    }
  };
}

function managerAuth() {
  return async () =>
    ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any;
}

function salesAuth() {
  return async () =>
    ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any;
}

test("GET /api/conversations/[id] returns the list-item DTO for an existing conversation", async () => {
  const cap = capturingBootstrap(sampleRow());
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.id, CONVERSATION_ID);
  assert.equal(cap.lastTenantId, TENANT_ID);
  assert.equal(cap.lastConversationId, CONVERSATION_ID);
  assert.deepEqual(Object.keys(body.data).sort(), [...CONVERSATION_LIST_DTO_KEYS].sort());
});

test("GET /api/conversations/[id] returns 404 when the conversation does not exist", async () => {
  const cap = capturingBootstrap(null);
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "Conversation not found");
});

test("GET /api/conversations/[id] returns 400 for a malformed id", async () => {
  const cap = capturingBootstrap(sampleRow());
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  for (const bad of ["conv-1", "", "  ", "javascript:alert(1)", `${CONVERSATION_ID}x`]) {
    const res = await handler(makeReq(), params(bad));
    assert.equal(res.status, 400, `expected 400 for "${bad}"`);
  }
  assert.equal(cap.lastConversationId, null);
});

test("SALES can fetch a conversation assigned to them", async () => {
  const cap = capturingBootstrap(sampleRow({ assigned_agent_id: AGENT_ID, assignment_status: "ASSIGNED" }));
  const handler = createConversationByIdGetHandler({
    requireAuth: salesAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.id, CONVERSATION_ID);
});

test("SALES gets 404 for a conversation assigned to another agent", async () => {
  const cap = capturingBootstrap(sampleRow({ assigned_agent_id: OTHER_AGENT_ID, assignment_status: "ASSIGNED" }));
  const handler = createConversationByIdGetHandler({
    requireAuth: salesAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 404);
});

test("SALES gets 404 for an unassigned conversation (mirrors mine-scope list)", async () => {
  const cap = capturingBootstrap(sampleRow({ assigned_agent_id: null }));
  const handler = createConversationByIdGetHandler({
    requireAuth: salesAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 404);
});

test("rows removed by own-platform-account filter return 404", async () => {
  const cap = capturingBootstrap(sampleRow());
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: () => []
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 404);
});

test("unauthorized request returns 401", async () => {
  const cap = capturingBootstrap(sampleRow());
  const handler = createConversationByIdGetHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 401);
  assert.equal(cap.lastConversationId, null);
});

test("repository without findInboxListItemById fails safe with 404", async () => {
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: () => ({ conversationRepository: {} }) as any,
    filterOwnPlatformAccountConversations: (rows: any[]) => rows
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 404);
});

test("DTO does not leak secrets or token material", async () => {
  const cap = capturingBootstrap(
    sampleRow({ secret_json: { token: "super-secret" }, access_token: "tok-123" })
  );
  const handler = createConversationByIdGetHandler({
    requireAuth: managerAuth(),
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq(), params());
  assert.equal(res.status, 200);
  const body = await res.json();
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("secret_json"), false);
  assert.equal(serialized.includes("super-secret"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("tok-123"), false);
  assert.deepEqual(Object.keys(body.data).sort(), [...CONVERSATION_LIST_DTO_KEYS].sort());
});
