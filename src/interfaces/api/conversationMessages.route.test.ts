import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createConversationMessagesGetHandler,
  parseIncludeConversationIds
} from "../../../app/api/conversations/[id]/messages/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const PRIMARY_ID = "d17bc402-7461-48fb-8b75-f2f3b02eb1b1";
const INCLUDED_ID = "e27bc402-7461-48fb-8b75-f2f3b02eb1b2";
const SALES_AGENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AGENT_ID = "22222222-2222-4222-8222-222222222222";

function assignmentRow(conversationId: string, assignedAgentId: string | null) {
  return {
    id: conversationId,
    tenantId: TENANT_ID,
    leadId: "9e68eadd-01b6-4c66-a522-74b97d6a6902",
    assignedAgentId,
    assignmentStatus: "ASSIGNED",
    status: "OPEN" as const
  };
}

function makeGetReq(
  conversationId: string,
  query?: { includeConversationIds?: string; limit?: string }
): NextRequest {
  const params = new URLSearchParams();
  if (query?.includeConversationIds) {
    params.set("includeConversationIds", query.includeConversationIds);
  }
  if (query?.limit) params.set("limit", query.limit);
  const qs = params.toString();
  const url = `http://local/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, {
    method: "GET",
    headers: new Headers({ Authorization: "Bearer t" })
  });
}

function bootstrap(opts: {
  assignments: Record<string, string | null>;
  listCalls?: unknown[];
}) {
  const listCalls: unknown[] = opts.listCalls ?? [];
  return {
    listCalls,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findByIdForAssignment: async (tenantId: string, conversationId: string) => {
            if (tenantId !== TENANT_ID) return null;
            const assignedAgentId = opts.assignments[conversationId];
            if (assignedAgentId === undefined) return null;
            return assignmentRow(conversationId, assignedAgentId);
          }
        },
        messageRepository: {
          listByConversation: async (input: unknown) => {
            listCalls.push(input);
            return { items: [], nextCursor: null };
          },
          listByConversationIds: async (input: unknown) => {
            listCalls.push(input);
            return { items: [], nextCursor: null };
          }
        }
      }) as any
  };
}

test("GET messages allows MANAGER for primary and includeConversationIds", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: OTHER_AGENT_ID,
      [INCLUDED_ID]: OTHER_AGENT_ID
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID, { includeConversationIds: INCLUDED_ID }), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 200);
  assert.equal(cap.listCalls.length, 1);
  assert.deepEqual((cap.listCalls[0] as any).conversationIds, [PRIMARY_ID, INCLUDED_ID]);
});

test("GET messages allows SALES when all requested conversations are assigned to self", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: SALES_AGENT_ID,
      [INCLUDED_ID]: SALES_AGENT_ID
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID, { includeConversationIds: INCLUDED_ID }), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 200);
  assert.equal(cap.listCalls.length, 1);
});

test("GET messages forbids SALES when includeConversationIds has another agent assignment", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: SALES_AGENT_ID,
      [INCLUDED_ID]: OTHER_AGENT_ID
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID, { includeConversationIds: INCLUDED_ID }), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 403);
  assert.equal(cap.listCalls.length, 0);
});

test("GET messages forbids SALES when primary conversation is assigned to another agent", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: OTHER_AGENT_ID
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000002",
        email: "s@x.com",
        role: "SALES",
        salesAgentId: SALES_AGENT_ID
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 403);
  assert.equal(cap.listCalls.length, 0);
});

test("GET messages returns 404 when a requested conversation id is missing", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: SALES_AGENT_ID
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "a@x.com",
        role: "ADMIN",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID, { includeConversationIds: INCLUDED_ID }), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 404);
  assert.equal(cap.listCalls.length, 0);
});

test("GET messages allows MANAGER for unassigned primary and grouped includeConversationIds", async () => {
  const extraA = "f37bc402-7461-48fb-8b75-f2f3b02eb1b3";
  const extraB = "a47bc402-7461-48fb-8b75-f2f3b02eb1b4";
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: null,
      [extraA]: null,
      [extraB]: null
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makeGetReq(PRIMARY_ID, { includeConversationIds: `${extraA},${extraB}` }),
    { params: Promise.resolve({ id: PRIMARY_ID }) }
  );
  assert.equal(res.status, 200);
  assert.equal(cap.listCalls.length, 1);
  assert.deepEqual((cap.listCalls[0] as { conversationIds: string[] }).conversationIds, [
    PRIMARY_ID,
    extraA,
    extraB
  ]);
});

test("GET messages returns 400 for malformed includeConversationIds", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: null
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makeGetReq(PRIMARY_ID, { includeConversationIds: "not-a-uuid" }), {
    params: Promise.resolve({ id: PRIMARY_ID })
  });
  assert.equal(res.status, 400);
  assert.equal(cap.listCalls.length, 0);
});

test("parseIncludeConversationIds deduplicates primary id in include list", () => {
  const ids = parseIncludeConversationIds(`${PRIMARY_ID},${INCLUDED_ID}`, PRIMARY_ID);
  assert.deepEqual(ids, [PRIMARY_ID, INCLUDED_ID]);
});

test("GET messages maps repository PostgREST column errors to 404 not 500", async () => {
  const cap = bootstrap({
    assignments: {
      [PRIMARY_ID]: null
    }
  });
  const handler = createConversationMessagesGetHandler({
    requireAuth: async () =>
      ({
        tenantId: TENANT_ID,
        userId: "00000000-0000-4000-8000-000000000001",
        email: "m@x.com",
        role: "MANAGER",
        salesAgentId: null
      }) as any,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findByIdForAssignment: async () => assignmentRow(PRIMARY_ID, null)
        },
        messageRepository: {
          listByConversation: async () => {
            const err = new Error("column messages.occurred_at does not exist") as Error & { code: string };
            err.code = "42703";
            throw err;
          }
        }
      }) as any
  });
  const res = await handler(makeGetReq(PRIMARY_ID), { params: Promise.resolve({ id: PRIMARY_ID }) });
  assert.equal(res.status, 404);
});
