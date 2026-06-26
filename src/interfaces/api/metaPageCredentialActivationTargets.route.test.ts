import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createMetaActivationTargetsHandler } from "../../../app/api/channel-connect/meta/activation-targets/route.js";
import type { ChannelConnectionRecord } from "../../../src/domain/channelConnections.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

const adminAuth = {
  tenantId: TENANT,
  role: "ADMIN" as const,
  userId: "auth-user-1",
  email: "admin@test.com",
  salesAgentId: "11111111-1111-4111-8111-111111111111"
};

const readyFacebook: ChannelConnectionRecord = {
  id: "507d0000-0000-4000-8000-00000000279d",
  tenantId: TENANT,
  provider: "FACEBOOK",
  status: "READY",
  providerAccountId: "541846535668129",
  providerAccountName: "Main Page",
  providerPageId: "541846535668129",
  providerIgAccountId: null,
  publicConnectionKey: "fb-main",
  webhookEndpoint: null,
  webhookActive: false,
  lastInboundVerifiedAt: null,
  lastOutboundVerifiedAt: null,
  lastHealthCheckAt: null,
  lastErrorCode: null,
  lastErrorMessageSafe: null,
  connectedBy: null,
  connectedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function buildRequest() {
  return new NextRequest("http://localhost/api/channel-connect/meta/activation-targets", {
    method: "GET",
    headers: {
      authorization: "Bearer test-token",
      "x-tenant-id": TENANT
    }
  });
}

test("activation targets route requires ADMIN", async () => {
  const handler = createMetaActivationTargetsHandler({
    apiBootstrap: () => ({}) as never,
    requireAuth: async () => {
      throw new Error("Forbidden");
    }
  });
  const response = await handler(buildRequest());
  assert.equal(response.status, 403);
});

test("activation targets route returns eligible Facebook connections only", async () => {
  const handler = createMetaActivationTargetsHandler({
    requireAuth: async () => adminAuth,
    apiBootstrap: () =>
      ({
        channelConnectionRepository: {
          listByTenant: async () => [
            readyFacebook,
            { ...readyFacebook, id: "ig-conn", provider: "INSTAGRAM" as const },
            { ...readyFacebook, id: "draft", status: "DRAFT" as const }
          ]
        }
      }) as never
  });
  const response = await handler(buildRequest());
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: { tenantId: string; targets: Array<{ connectionId: string; providerPageId: string | null }> };
  };
  assert.equal(body.data.tenantId, TENANT);
  assert.equal(body.data.targets.length, 1);
  assert.equal(body.data.targets[0]!.connectionId, readyFacebook.id);
  assert.equal(JSON.stringify(body).includes("accessToken"), false);
});
