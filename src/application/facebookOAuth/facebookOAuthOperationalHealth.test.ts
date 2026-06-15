import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import { runFacebookOperationalHealth } from "./facebookOAuthOperationalHealth.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const TEST_KEY = "d".repeat(64);

function baseConnection(overrides: Partial<ChannelConnectionRecord> = {}): ChannelConnectionRecord {
  const now = new Date("2026-06-15T10:00:00.000Z");
  return {
    id: CONNECTION_ID,
    tenantId: TENANT,
    provider: "FACEBOOK",
    status: "AUTHORIZING",
    providerAccountId: "page-1",
    providerAccountName: "Test Page",
    providerPageId: "page-1",
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test_public_key_123456",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: "agent-1",
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function accessTokenMeta(): ChannelCredentialMetadataDto {
  return {
    connectionId: CONNECTION_ID,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    credentialState: "SET",
    secretFingerprint: "fp",
    tokenExpiresAt: null,
    updatedAt: new Date().toISOString()
  };
}

function graphFetchSuccess() {
  return async (url: string) => {
    if (url.includes("fields=id,name,tasks")) {
      return new Response(
        JSON.stringify({ id: "page-1", name: "Test Page", tasks: ["MESSAGING"] }),
        { status: 200 }
      );
    }
    if (url.includes("fields=id&")) {
      return new Response(JSON.stringify({ id: "page-1" }), { status: 200 });
    }
    if (url.includes("fields=id,name")) {
      return new Response(JSON.stringify({ id: "page-1", name: "Test Page" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "unexpected", code: 1 } }), { status: 400 });
  };
}

function buildRepos() {
  return {
    channelConnectionRepository: {
      listCredentialMetadataByConnection: async () => [accessTokenMeta()],
      retrieveDecryptedCredentialForRuntime: async () => ({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "FACEBOOK" as const,
        credentialType: "ACCESS_TOKEN" as const,
        plaintextSecret: "oauth-page-token"
      }),
      findByTenantAndProvider: async () => baseConnection()
    },
    channelSettingRepository: {
      getRuntimeConfigForConnectionTest: async () => null
    }
  };
}

test("operational health all PASS advances to READY / CONNECTED", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  const repos = buildRepos();
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    now: () => new Date("2026-06-15T12:00:00.000Z")
  });

  assert.equal(result.connectionStatus, "READY");
  assert.equal(result.healthStatus, "OK");
  assert.equal(result.displayState, "CONNECTED");
  assert.equal(result.reconnectRequired, false);
  assert.equal(result.checks.length, 5);
  assert.equal(result.checks.every((check) => check.status === "PASS"), true);
  assert.equal(JSON.stringify(result).includes("oauth-page-token"), false);
});

test("operational health resolver disabled blocks RUNTIME_TEST_CONNECTION", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "false";
  const repos = buildRepos();
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch
  });

  assert.equal(result.connectionStatus, "AUTHORIZING");
  assert.equal(result.displayState, "CONNECTING");
  assert.notEqual(result.healthStatus, "OK");
  const runtimeCheck = result.checks.find((check) => check.code === "RUNTIME_TEST_CONNECTION");
  assert.equal(runtimeCheck?.status, "FAIL");
});

test("operational health revoked token maps to reconnect required", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const repos = buildRepos();
  repos.channelConnectionRepository.listCredentialMetadataByConnection = async () => [
    { ...accessTokenMeta(), credentialState: "REVOKED" }
  ];

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    graphVersion: "v25.0"
  });

  assert.equal(result.healthStatus, "RECONNECT_REQUIRED");
  assert.equal(result.displayState, "NEEDS_RECONNECT");
  assert.equal(result.reconnectRequired, true);
});

test("operational health page mismatch stays pre-READY", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  const repos = buildRepos();
  const fetchFn = async (url: string) => {
    if (url.includes("fields=id,name,tasks")) {
      return new Response(
        JSON.stringify({ id: "other-page", name: "Other", tasks: ["MESSAGING"] }),
        { status: 200 }
      );
    }
    if (url.includes("fields=id")) {
      return new Response(JSON.stringify({ id: "other-page" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "other-page", name: "Other" }), { status: 200 });
  };

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch
  });

  assert.equal(result.connectionStatus, "AUTHORIZING");
  assert.equal(result.displayState, "CONNECTING");
  const pageAccess = result.checks.find((check) => check.code === "PAGE_ACCESS");
  assert.equal(pageAccess?.status, "FAIL");
});
