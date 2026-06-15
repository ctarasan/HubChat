import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import {
  isOAuthManagedFacebookConnection,
  resolveFacebookRuntimeCredentialForTest,
  resolveOAuthManagedFacebookCredential
} from "./facebookOAuthRuntimeCredential.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const TEST_KEY = "c".repeat(64);

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

function accessTokenMeta(state: ChannelCredentialMetadataDto["credentialState"] = "SET"): ChannelCredentialMetadataDto {
  return {
    connectionId: CONNECTION_ID,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    credentialState: state,
    secretFingerprint: "fp",
    tokenExpiresAt: null,
    updatedAt: new Date().toISOString()
  };
}

test("isOAuthManagedFacebookConnection requires stored page credential", () => {
  const connection = baseConnection();
  assert.equal(isOAuthManagedFacebookConnection(connection, [accessTokenMeta()]), true);
  assert.equal(isOAuthManagedFacebookConnection(connection, []), false);
  assert.equal(
    isOAuthManagedFacebookConnection(baseConnection({ connectedAt: null }), [accessTokenMeta()]),
    false
  );
});

test("resolveOAuthManagedFacebookCredential decrypts channel credential", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const connection = baseConnection();
  const repo = {
    listCredentialMetadataByConnection: async () => [accessTokenMeta()],
    retrieveDecryptedCredentialForRuntime: async () => ({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "FACEBOOK" as const,
      credentialType: "ACCESS_TOKEN" as const,
      plaintextSecret: "page-token-secret"
    })
  };

  const resolved = await resolveOAuthManagedFacebookCredential({
    channelConnectionRepository: repo as any,
    tenantId: TENANT,
    connection
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.accessToken, "page-token-secret");
    assert.equal(resolved.providerPageId, "page-1");
  }
});

test("resolveFacebookRuntimeCredentialForTest prefers OAuth credential over manual settings", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const connection = baseConnection();
  const channelConnectionRepository = {
    findByTenantAndProvider: async () => connection,
    listCredentialMetadataByConnection: async () => [accessTokenMeta()],
    retrieveDecryptedCredentialForRuntime: async () => ({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "FACEBOOK" as const,
      credentialType: "ACCESS_TOKEN" as const,
      plaintextSecret: "oauth-page-token"
    })
  };
  const channelSettingRepository = {
    getRuntimeConfigForConnectionTest: async () => ({
      tenantId: TENANT,
      channel: "FACEBOOK" as const,
      enabled: true,
      providerPageId: "manual-page",
      providerAccountName: "Manual",
      secrets: { accessToken: "manual-token" }
    })
  };

  const resolved = await resolveFacebookRuntimeCredentialForTest({
    tenantId: TENANT,
    channelConnectionRepository: channelConnectionRepository as any,
    channelSettingRepository: channelSettingRepository as any
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.resolved.source, "oauth_channel_credentials");
    assert.equal(resolved.resolved.runtime.secrets.accessToken, "oauth-page-token");
  }
});

test("resolveFacebookRuntimeCredentialForTest uses manual settings when OAuth connection absent", async () => {
  const channelConnectionRepository = {
    findByTenantAndProvider: async () => null,
    listCredentialMetadataByConnection: async () => []
  };
  const channelSettingRepository = {
    getRuntimeConfigForConnectionTest: async () => ({
      tenantId: TENANT,
      channel: "FACEBOOK" as const,
      enabled: true,
      providerPageId: "manual-page",
      providerAccountName: "Manual",
      secrets: { accessToken: "manual-token" }
    })
  };

  const resolved = await resolveFacebookRuntimeCredentialForTest({
    tenantId: TENANT,
    channelConnectionRepository: channelConnectionRepository as any,
    channelSettingRepository: channelSettingRepository as any,
    env: { ...process.env, HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE: "ENV_ONLY" }
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.resolved.source, "manual_channel_settings");
    assert.equal(resolved.resolved.oauthManaged, false);
  }
});

test("OAuth-managed invalid credential does not fall back to manual settings", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const connection = baseConnection();
  const channelConnectionRepository = {
    findByTenantAndProvider: async () => connection,
    listCredentialMetadataByConnection: async () => [accessTokenMeta("REVOKED")],
    retrieveDecryptedCredentialForRuntime: async () => null
  };
  const channelSettingRepository = {
    getRuntimeConfigForConnectionTest: async () => ({
      tenantId: TENANT,
      channel: "FACEBOOK" as const,
      enabled: true,
      providerPageId: "manual-page",
      providerAccountName: "Manual",
      secrets: { accessToken: "manual-token" }
    })
  };

  const resolved = await resolveFacebookRuntimeCredentialForTest({
    tenantId: TENANT,
    channelConnectionRepository: channelConnectionRepository as any,
    channelSettingRepository: channelSettingRepository as any
  });
  assert.equal(resolved.ok, false);
});
