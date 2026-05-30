import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createRetentionDryRunGetHandler } from "../../../app/api/retention/dry-run/route.js";
import { buildRetentionDryRunReport } from "../../lib/retentionDryRun.js";
import type { AppRole } from "./auth.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "ca92d847-53cd-4b60-9e4d-5fd3f8ad8650";

function makeReq(): NextRequest {
  return new NextRequest("http://local/api/retention/dry-run", {
    headers: new Headers({
      Authorization: "Bearer test-token",
      "x-tenant-id": TENANT_ID
    })
  });
}

function sampleReport(tenantId: string = TENANT_ID) {
  return buildRetentionDryRunReport({
    tenantId,
    now: new Date("2026-05-30T12:00:00.000Z"),
    archivedConversations: [
      {
        id: "conv-arch",
        leadId: "lead-1",
        channelType: "LINE",
        status: "ARCHIVED",
        resolvedAt: "2025-01-01T00:00:00.000Z",
        closedAt: null,
        updatedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-06-01T00:00:00.000Z"
      }
    ],
    messages: [
      {
        conversationId: "conv-arch",
        messageType: "TEXT",
        mediaUrl: null,
        previewUrl: null,
        metadataJson: null,
        rawPayload: { event: "x" },
        createdAt: "2025-02-01T00:00:00.000Z"
      }
    ],
    webhookRawPayloadEligibleCount: 1
  });
}

function handlerForRole(role: "ADMIN" | "MANAGER" | "SALES", tenantId = TENANT_ID) {
  return createRetentionDryRunGetHandler({
    requireAuth: async (_req: NextRequest, allowedRoles: AppRole[]) => {
      const auth =
        role === "ADMIN"
          ? {
              tenantId,
              userId: "u-admin",
              email: "admin@x.com",
              role: "ADMIN" as const,
              salesAgentId: null
            }
          : role === "MANAGER"
            ? {
                tenantId,
                userId: "u-mgr",
                email: "mgr@x.com",
                role: "MANAGER" as const,
                salesAgentId: "agent-1"
              }
            : {
                tenantId,
                userId: "u-sales",
                email: "sales@x.com",
                role: "SALES" as const,
                salesAgentId: "agent-1"
              };
      if (!allowedRoles.includes(auth.role)) throw new Error("Forbidden");
      return auth;
    },
    runRetentionDryRun: async (auth) => sampleReport(auth.tenantId)
  });
}

test("GET /api/retention/dry-run ADMIN gets 200 dry-run report", async () => {
  const res = await handlerForRole("ADMIN")(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: ReturnType<typeof sampleReport> };
  assert.equal(json.data.tenantId, TENANT_ID);
  assert.equal(json.data.policy.archivedMediaRetentionDays, 90);
  assert.equal(json.data.summary.archivedConversationsEligibleForMessagePurge, 1);
  assert.equal(json.data.samples.messagePurgeCandidates.length, 1);
});

test("GET /api/retention/dry-run MANAGER gets 403", async () => {
  const res = await handlerForRole("MANAGER")(makeReq());
  assert.equal(res.status, 403);
});

test("GET /api/retention/dry-run SALES gets 403", async () => {
  const res = await handlerForRole("SALES")(makeReq());
  assert.equal(res.status, 403);
});

test("GET /api/retention/dry-run response excludes message content and secrets", async () => {
  const res = await handlerForRole("ADMIN")(makeReq());
  const text = await res.text();
  assert.equal(text.includes("access_token"), false);
  assert.equal(text.includes("secret_json"), false);
  assert.equal(text.includes("payload_json"), false);
  assert.equal(text.includes("Bearer"), false);
  assert.equal(text.includes('"content"'), false);
  assert.equal(text.includes("signedUrl"), false);
});

test("GET /api/retention/dry-run enforces tenant scoping from auth", async () => {
  const res = await handlerForRole("ADMIN", OTHER_TENANT)(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { tenantId: string } };
  assert.equal(json.data.tenantId, OTHER_TENANT);
});

test("GET /api/retention/dry-run empty tenant returns zero counts", async () => {
  const handler = createRetentionDryRunGetHandler({
    requireAuth: async () => ({
      tenantId: TENANT_ID,
      userId: "u-admin",
      email: "admin@x.com",
      role: "ADMIN" as const,
      salesAgentId: null
    }),
    runRetentionDryRun: async () =>
      buildRetentionDryRunReport({
        tenantId: TENANT_ID,
        now: new Date("2026-05-30T12:00:00.000Z"),
        archivedConversations: [],
        messages: []
      })
  });
  const res = await handler(makeReq());
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { summary: { estimatedMessagesEligible: number } } };
  assert.equal(json.data.summary.estimatedMessagesEligible, 0);
});
