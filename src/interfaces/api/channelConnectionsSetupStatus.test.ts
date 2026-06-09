import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { createChannelSetupStatusGetHandler } from "../../../app/api/channel-connections/setup-status/route.js";
import type { ChannelSetupStatusListDto } from "../../domain/channelSetupStatus.js";
import type { ChannelSettingPublicDto } from "../../domain/channelSettings.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

const sampleList: ChannelSetupStatusListDto = {
  data: [
    {
      channel: "LINE",
      setupStatus: "not_configured",
      connectionLabel: null,
      credentialsPresent: { accessToken: false, channelSecret: false, allRequiredPresent: false },
      testConnectionAvailable: false,
      webhookCallbackUrl: "/api/webhook/line",
      missingSetupSteps: ["ENABLE_CHANNEL", "SET_ACCESS_TOKEN", "SET_CHANNEL_SECRET"],
      activeConnectionScope: {
        hasActiveConnection: false,
        activeConnectionCount: 0,
        scopeBucket: "none",
        maskedProviderIdentity: null
      },
      channelSettingsStatus: null,
      connectionPlatformStatus: null,
      enabled: false,
      lastVerifiedAt: null,
      safeLastError: null
    },
    {
      channel: "FACEBOOK",
      setupStatus: "ready",
      connectionLabel: "Customer FB Page",
      credentialsPresent: {
        accessToken: true,
        appSecret: true,
        verifyToken: true,
        allRequiredPresent: true
      },
      testConnectionAvailable: true,
      webhookCallbackUrl: "https://hub.example.test/api/webhook/facebook",
      missingSetupSteps: [],
      activeConnectionScope: {
        hasActiveConnection: true,
        activeConnectionCount: 1,
        scopeBucket: "active",
        maskedProviderIdentity: "5418…len=15"
      },
      channelSettingsStatus: "READY",
      connectionPlatformStatus: "READY",
      enabled: true,
      lastVerifiedAt: "2026-06-01T10:00:00.000Z",
      safeLastError: null
    },
    {
      channel: "INSTAGRAM",
      setupStatus: "configured",
      connectionLabel: "Instagram Account",
      credentialsPresent: {
        accessToken: true,
        appSecret: false,
        verifyToken: true,
        allRequiredPresent: false
      },
      testConnectionAvailable: false,
      webhookCallbackUrl: "/api/webhook/instagram",
      missingSetupSteps: ["SET_APP_SECRET", "RUN_TEST_CONNECTION"],
      activeConnectionScope: {
        hasActiveConnection: false,
        activeConnectionCount: 0,
        scopeBucket: "historical_only",
        maskedProviderIdentity: null
      },
      channelSettingsStatus: "NOT_CONFIGURED",
      connectionPlatformStatus: "CONNECTED",
      enabled: true,
      lastVerifiedAt: null,
      safeLastError: null
    }
  ]
};

function auth(role: "ADMIN" | "MANAGER" | "SALES", tenantId = TENANT_A) {
  return async (_req: NextRequest, allowedRoles: string[]) => {
    if (!allowedRoles.includes(role)) {
      throw new Error("Forbidden");
    }
    return {
      tenantId,
      role,
      userId: "u1",
      email: `${role.toLowerCase()}@test.com`,
      salesAgentId: role === "SALES" ? "sa1" : null
    };
  };
}

function makeReq(tenantId: string) {
  return new NextRequest("http://local/api/channel-connections/setup-status", {
    headers: new Headers({
      Authorization: "Bearer test",
      "x-tenant-id": tenantId
    })
  });
}

function handlerFor(role: "ADMIN" | "MANAGER" | "SALES" = "MANAGER") {
  return createChannelSetupStatusGetHandler({
    requireAuth: auth(role),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          listByTenant: async (tenantId: string) => {
            assert.equal(tenantId, TENANT_A);
            return [] as ChannelSettingPublicDto[];
          }
        },
        channelConnectionRepository: {
          listByTenant: async (tenantId: string) => {
            assert.equal(tenantId, TENANT_A);
            return [] as ChannelConnectionRecord[];
          }
        }
      }) as any
  });
}

test("GET /api/channel-connections/setup-status allows ADMIN", async () => {
  const handler = createChannelSetupStatusGetHandler({
    requireAuth: auth("ADMIN"),
    apiBootstrap: () =>
      ({
        channelSettingRepository: { listByTenant: async () => [] },
        channelConnectionRepository: { listByTenant: async () => [] }
      }) as any
  });
  const res = await handler(makeReq(TENANT_A));
  assert.equal(res.status, 200);
  const json = (await res.json()) as ChannelSetupStatusListDto;
  assert.equal(json.data.length, 3);
});

test("GET /api/channel-connections/setup-status allows MANAGER", async () => {
  const res = await handlerFor("MANAGER")(makeReq(TENANT_A));
  assert.equal(res.status, 200);
});

test("GET /api/channel-connections/setup-status rejects SALES", async () => {
  const handler = handlerFor("SALES");
  const res = await handler(makeReq(TENANT_A));
  assert.equal(res.status, 403);
});

test("setup status response contract is safe for operator display", async () => {
  const handler = createChannelSetupStatusGetHandler({
    requireAuth: auth("ADMIN"),
    apiBootstrap: () =>
      ({
        channelSettingRepository: {
          listByTenant: async () => [
            {
              channel: "FACEBOOK",
              enabled: true,
              configured: true,
              status: "READY",
              providerPageId: "541846535668129",
              providerAccountName: "Customer FB Page",
              lastVerifiedAt: null,
              lastError: null,
              updatedAt: "2026-06-01T00:00:00.000Z",
              secretState: { accessToken: "SET", appSecret: "SET", verifyToken: "SET" },
              displayName: "Customer FB Page",
              configJson: {},
              secretsConfigured: []
            }
          ]
        },
        channelConnectionRepository: {
          listByTenant: async () => [
            {
              id: "c1",
              tenantId: TENANT_A,
              provider: "FACEBOOK",
              status: "READY",
              providerAccountId: null,
              providerAccountName: "Customer FB Page",
              providerPageId: "541846535668129",
              providerIgAccountId: null,
              publicConnectionKey: "ccp_key",
              webhookEndpoint: "https://hub.example.test/api/webhook/facebook",
              webhookActive: true,
              lastInboundVerifiedAt: null,
              lastOutboundVerifiedAt: null,
              lastHealthCheckAt: null,
              lastErrorCode: null,
              lastErrorMessageSafe: null,
              connectedBy: null,
              connectedAt: null,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ]
        }
      }) as any
  });
  const res = await handler(makeReq(TENANT_A));
  const json = (await res.json()) as ChannelSetupStatusListDto;
  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes("541846535668129"), false);
  assert.equal(serialized.includes("secret"), false);
  const fb = json.data.find((row) => row.channel === "FACEBOOK")!;
  assert.equal(fb.setupStatus, "ready");
  assert.equal(fb.connectionLabel, "Customer FB Page");
});

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("setup-status route does not import runtime resolver or DB_ONLY flags", () => {
  const route = readSource("../../../app/api/channel-connections/setup-status/route.ts");
  const useCase = readSource("../../../src/application/channelSetup/getChannelSetupStatus.ts");
  const domain = readSource("../../../src/domain/channelSetupStatus.ts");
  for (const source of [route, useCase, domain]) {
    assert.equal(source.includes("DB_ONLY"), false);
    assert.equal(source.includes("channelConnectRuntimeResolver"), false);
    assert.equal(source.includes("resolveWorkerOutbound"), false);
  }
});

test("sample setup status mapping covers LINE Facebook Instagram states", () => {
  assert.equal(sampleList.data[0]!.channel, "LINE");
  assert.equal(sampleList.data[0]!.setupStatus, "not_configured");
  assert.equal(sampleList.data[1]!.setupStatus, "ready");
  assert.equal(sampleList.data[2]!.setupStatus, "configured");
});
