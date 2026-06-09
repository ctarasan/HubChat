import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "./channelConnections.js";
import type { ChannelSettingPublicDto } from "./channelSettings.js";
import { buildChannelSetupStatusList, buildChannelSetupStatusItem } from "./channelSetupStatus.js";
import { buildTenantConnectionScopeContext } from "./channelConnectionScope.js";

function baseSetting(overrides: Partial<ChannelSettingPublicDto> = {}): ChannelSettingPublicDto {
  return {
    channel: "FACEBOOK",
    enabled: true,
    configured: true,
    status: "READY",
    providerPageId: "541846535668129",
    providerAccountName: "Customer FB Page",
    lastVerifiedAt: "2026-06-01T10:00:00.000Z",
    lastError: null,
    updatedAt: "2026-06-01T10:00:00.000Z",
    secretState: {
      accessToken: "SET",
      appSecret: "SET",
      verifyToken: "SET"
    },
    displayName: "Customer FB Page",
    configJson: { providerPageId: "541846535668129" },
    secretsConfigured: [],
    ...overrides
  };
}

function baseConnection(overrides: Partial<ChannelConnectionRecord> = {}): ChannelConnectionRecord {
  return {
    id: "conn-fb-1",
    tenantId: "t1",
    provider: "FACEBOOK",
    status: "READY",
    providerAccountId: null,
    providerAccountName: "Customer FB Page",
    providerPageId: "541846535668129",
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test_public_key_abcdefghij",
    webhookEndpoint: "https://hub.example.test/api/webhook/facebook",
    webhookActive: true,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides
  };
}

test("buildChannelSetupStatusList returns LINE, Facebook, Instagram with ready Facebook", () => {
  const result = buildChannelSetupStatusList({
    settings: [baseSetting()],
    connections: [baseConnection()]
  });
  assert.equal(result.data.length, 3);
  const fb = result.data.find((row) => row.channel === "FACEBOOK")!;
  assert.equal(fb.setupStatus, "ready");
  assert.equal(fb.connectionLabel, "Customer FB Page");
  assert.equal(fb.testConnectionAvailable, true);
  assert.equal(fb.webhookCallbackUrl, "https://hub.example.test/api/webhook/facebook");
  assert.equal(fb.activeConnectionScope.hasActiveConnection, true);
  assert.equal(fb.activeConnectionScope.maskedProviderIdentity, "5418…len=15");
});

test("missing config maps to not_configured with setup steps", () => {
  const result = buildChannelSetupStatusList({
    settings: [],
    connections: []
  });
  const line = result.data.find((row) => row.channel === "LINE")!;
  assert.equal(line.setupStatus, "not_configured");
  assert.deepEqual(line.missingSetupSteps, [
    "ENABLE_CHANNEL",
    "SET_ACCESS_TOKEN",
    "SET_CHANNEL_SECRET"
  ]);
  assert.equal(line.testConnectionAvailable, false);
});

test("partial LINE secrets map to configured and needs_attention when error present", () => {
  const setting = baseSetting({
    channel: "LINE",
    configured: false,
    status: "ERROR",
    lastError: "LINE health check failed",
    providerPageId: null,
    providerAccountName: "LINE Bot",
    displayName: "LINE Bot",
    secretState: { accessToken: "SET", channelSecret: "EMPTY" },
    configJson: {}
  });
  const item = buildChannelSetupStatusItem({
    channel: "LINE",
    setting,
    connection: null,
    scopeContext: buildTenantConnectionScopeContext({ connections: [], settingsFallback: [] })
  });
  assert.equal(item.setupStatus, "needs_attention");
  assert.equal(item.credentialsPresent.allRequiredPresent, false);
  assert.ok(item.missingSetupSteps.includes("SET_CHANNEL_SECRET"));
  assert.ok(item.missingSetupSteps.includes("RESOLVE_CONNECTION_ERROR"));
});

test("REVOKED connection maps to disconnected", () => {
  const item = buildChannelSetupStatusItem({
    channel: "INSTAGRAM",
    setting: baseSetting({
      channel: "INSTAGRAM",
      providerAccountName: "IG Shop",
      displayName: "IG Shop"
    }),
    connection: baseConnection({
      provider: "INSTAGRAM",
      status: "REVOKED",
      providerPageId: "17841400000000000",
      providerIgAccountId: "17841400000000000"
    }),
    scopeContext: buildTenantConnectionScopeContext({
      connections: [baseConnection({ provider: "INSTAGRAM", status: "REVOKED" })]
    })
  });
  assert.equal(item.setupStatus, "disconnected");
  assert.deepEqual(item.missingSetupSteps, ["RECONNECT_CHANNEL"]);
});

test("connection label never uses raw numeric provider id", () => {
  const item = buildChannelSetupStatusItem({
    channel: "FACEBOOK",
    setting: baseSetting({
      providerAccountName: "541846535668129",
      displayName: "541846535668129"
    }),
    connection: baseConnection({ providerAccountName: "541846535668129" }),
    scopeContext: buildTenantConnectionScopeContext({ connections: [baseConnection()] })
  });
  assert.equal(item.connectionLabel, "Facebook Page");
  assert.equal(String(item.connectionLabel).includes("5418"), false);
});

test("serialized setup status does not leak secrets or raw provider page id fields", () => {
  const result = buildChannelSetupStatusList({
    settings: [baseSetting()],
    connections: [baseConnection()]
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("541846535668129"), false);
  assert.equal(serialized.includes("secret_json"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("page_access_token"), false);
  assert.equal(serialized.includes("providerPageId"), false);
  assert.equal(serialized.includes("provider_page_id"), false);
});
