import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createConversationsGetHandler } from "../../../app/api/conversations/route.js";

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
  return {
    get lastListInput() {
      return lastListInput;
    },
    apiBootstrap: () =>
      ({
        conversationRepository: {
          list: async (input: any) => {
            lastListInput = input;
            return { items: [{ id: "c1", tenant_id: TENANT_ID }], nextCursor: null };
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

test("MANAGER scope=assigned_to_me passes agent id", async () => {
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

test("SALES no scope defaults to assigned_to_me filter", async () => {
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

test("SALES scope=unassigned returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "unassigned" }));
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

test("MANAGER scope=assigned_to_me without salesAgentId returns 403", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", scope: "assigned_to_me" }));
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

test("status and channel pass through with scope", async () => {
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
      status: "OPEN",
      channel: "LINE"
    })
  );
  assert.equal(cap.lastListInput.status, "OPEN");
  assert.equal(cap.lastListInput.channel, "LINE");
  assert.equal(cap.lastListInput.assignmentFilter, "unassigned");
});

test("list accepts RESOLVED and ARCHIVED status query (Phase II-C1)", async () => {
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
});

test("list still accepts CLOSED status for backward compatibility", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  await handler(makeReq({ limit: "10", status: "CLOSED" }));
  assert.equal(cap.lastListInput.status, "CLOSED");
});

test("invalid conversation status query returns 400", async () => {
  const cap = bootstrapCapturingList();
  const handler = createConversationsGetHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: AGENT_ID }) as any,
    apiBootstrap: cap.apiBootstrap,
    filterOwnPlatformAccountConversations: cap.passthroughFilter
  });
  const res = await handler(makeReq({ limit: "10", status: "BOGUS" }));
  assert.equal(res.status, 400);
  assert.equal(cap.lastListInput, null);
});
