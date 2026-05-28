import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createConversationFollowUpPatchHandler } from "../../../app/api/conversations/[id]/follow-up/route.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONV_ID = "3b241101-e2bb-4955-9933-fd6a836e82f8";
const LEAD_ID = "6b241101-e2bb-4955-9933-fd6a836e82fb";
const AGENT_SELF = "11111111-1111-4111-8111-111111111111";
const AGENT_OTHER = "22222222-2222-4222-8222-222222222222";

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest(`http://local/api/conversations/${CONV_ID}/follow-up`, {
    method: "PATCH",
    headers: new Headers({ "Content-Type": "application/json", Authorization: "Bearer t", "x-tenant-id": TENANT_ID }),
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

function bootstrap(opts: { row?: ReturnType<typeof baseRow> | null }) {
  const patches: unknown[] = [];
  const row = opts.row === undefined ? baseRow() : opts.row;

  return {
    patches,
    apiBootstrap: () =>
      ({
        conversationRepository: {
          findById: async (tenantId: string, conversationId: string) => {
            if (!row || tenantId !== TENANT_ID || conversationId !== CONV_ID) return null;
            return { ...row };
          },
          updateConversationFollowUp: async (input: unknown) => {
            patches.push(input);
          }
        }
      }) as any
  };
}

test("PATCH follow-up 200 and stable response shape", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
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
  const res = await handler(
    makePatchReq({ followUpAt: "2026-05-15T09:00:00.000Z" }),
    { params: Promise.resolve({ id: CONV_ID }) }
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { id: string; followUpAt: string | null; followUpNote: string | null } };
  assert.equal(json.data.id, CONV_ID);
  assert.equal(json.data.followUpAt, "2026-05-15T09:00:00.000Z");
  assert.equal(json.data.followUpNote, "note");
  assert.equal(cap.patches.length, 1);
});

test("PATCH follow-up 400 on invalid body", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({}), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 400);
  assert.equal(cap.patches.length, 0);
});

test("PATCH follow-up 401 when Unauthorized", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () => {
      throw new Error("Unauthorized");
    },
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ followUpNote: "x" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 401);
});

test("PATCH follow-up 403 when SALES not assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_OTHER } });
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ followUpNote: "x" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 403);
});

test("PATCH follow-up 200 when SALES is assignee", async () => {
  const cap = bootstrap({ row: { ...baseRow(), assignedAgentId: AGENT_SELF } });
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "s@x.com", role: "SALES", salesAgentId: AGENT_SELF }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ followUpNote: "ok" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 200);
  assert.equal(cap.patches.length, 1);
});

test("PATCH follow-up 404 when conversation missing", async () => {
  const cap = bootstrap({ row: null });
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(makePatchReq({ followUpNote: "x" }), { params: Promise.resolve({ id: CONV_ID }) });
  assert.equal(res.status, 404);
});

test("PATCH follow-up null clears both followUpAt and followUpNote", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makePatchReq({ followUpAt: null, followUpNote: null }),
    { params: Promise.resolve({ id: CONV_ID }) }
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { followUpAt: string | null; followUpNote: string | null } };
  assert.equal(json.data.followUpAt, null);
  assert.equal(json.data.followUpNote, null);
});

test("PATCH follow-up trims followUpNote output", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makePatchReq({ followUpNote: "  next call  " }),
    { params: Promise.resolve({ id: CONV_ID }) }
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { followUpNote: string | null } };
  assert.equal(json.data.followUpNote, "next call");
});

test("PATCH follow-up does not write SLA fields", async () => {
  const cap = bootstrap({});
  const handler = createConversationFollowUpPatchHandler({
    requireAuth: async () =>
      ({ tenantId: TENANT_ID, userId: "u", email: "m@x.com", role: "MANAGER", salesAgentId: null }) as any,
    apiBootstrap: cap.apiBootstrap
  });
  const res = await handler(
    makePatchReq({ followUpAt: "2026-05-15T09:00:00.000Z" }),
    { params: Promise.resolve({ id: CONV_ID }) }
  );
  assert.equal(res.status, 200);
  const patch = cap.patches[0] as { patch: Record<string, unknown> };
  assert.equal(Object.prototype.hasOwnProperty.call(patch.patch, "slaDueAt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch.patch, "sla_due_at"), false);
});
