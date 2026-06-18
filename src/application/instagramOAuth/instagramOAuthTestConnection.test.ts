import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import { tryInstagramOAuthTestConnection } from "./instagramOAuthTestConnection.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "22222222-2222-4222-8222-222222222222";

function instagramConnection(): ChannelConnectionRecord {
  return {
    id: CONNECTION,
    tenantId: TENANT,
    provider: "INSTAGRAM",
    status: "READY",
    providerAccountId: null,
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

test("tryInstagramOAuthTestConnection returns null when feature flag is OFF", async () => {
  const result = await tryInstagramOAuthTestConnection(
    { tenantId: TENANT },
    {
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => [
          {
            id: "cred-1",
            tenantId: TENANT,
            channelConnectionId: CONNECTION,
            provider: "INSTAGRAM",
            authFamily: "INSTAGRAM_BUSINESS_LOGIN",
            credentialStatus: "ACTIVE",
            providerInstagramAccountId: "17841400000000001",
            providerUserId: "17841400000000001",
            verifiedUsername: "brand",
            verifiedAccountType: "BUSINESS",
            identityVerifiedAt: null,
            tokenExpiresAt: "2030-01-01T00:00:00.000Z",
            refreshEligibleAt: null,
            lastRefreshAt: null,
            lastRefreshStatus: "NEVER",
            connectionHealthStatus: "HEALTHY",
            credentialVersion: 1,
            connectedAt: null,
            revokedAt: null,
            reauthRequiredAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      } as never,
      env: { HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "false" }
    }
  );
  assert.equal(result, null);
});

test("tryInstagramOAuthTestConnection verifies identity and returns READY", async () => {
  const result = await tryInstagramOAuthTestConnection(
    { tenantId: TENANT },
    {
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection(),
        findById: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => [
          {
            id: "cred-1",
            tenantId: TENANT,
            channelConnectionId: CONNECTION,
            provider: "INSTAGRAM",
            authFamily: "INSTAGRAM_BUSINESS_LOGIN",
            credentialStatus: "ACTIVE",
            providerInstagramAccountId: "17841400000000001",
            providerUserId: "17841400000000001",
            verifiedUsername: "brand",
            verifiedAccountType: "BUSINESS",
            identityVerifiedAt: null,
            tokenExpiresAt: "2030-01-01T00:00:00.000Z",
            refreshEligibleAt: null,
            lastRefreshAt: null,
            lastRefreshStatus: "NEVER",
            connectionHealthStatus: "HEALTHY",
            credentialVersion: 1,
            connectedAt: null,
            revokedAt: null,
            reauthRequiredAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        findActiveByConnection: async () => ({
          id: "cred-1",
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          provider: "INSTAGRAM",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          credentialStatus: "ACTIVE",
          providerInstagramAccountId: "17841400000000001",
          providerUserId: "17841400000000001",
          verifiedUsername: "brand",
          verifiedAccountType: "BUSINESS",
          identityVerifiedAt: null,
          tokenExpiresAt: "2030-01-01T00:00:00.000Z",
          refreshEligibleAt: null,
          lastRefreshAt: null,
          lastRefreshStatus: "NEVER",
          connectionHealthStatus: "HEALTHY",
          credentialVersion: 1,
          connectedAt: null,
          revokedAt: null,
          reauthRequiredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }),
        retrieveDecryptedMaterial: async () => ({
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          credentialId: "cred-1",
          accessToken: "oauth-token",
          tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          credentialVersion: 1
        })
      } as never,
      identityClient: {
        getOwnProfessionalAccount: async () => ({
          professionalAccountId: "17841400000000001" as never,
          username: "brand.official" as never,
          accountType: "BUSINESS"
        })
      },
      env: {
        HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
        HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "true"
      },
      now: () => new Date("2026-06-21T10:00:00.000Z")
    }
  );

  assert.ok(result);
  assert.equal(result?.ok, true);
  assert.equal(result?.status, "READY");
  assert.match(result?.message ?? "", /@brand\.official/);
  assert.doesNotMatch(JSON.stringify(result), /oauth-token|accessToken/i);
});

test("tryInstagramOAuthTestConnection fails closed on identity mismatch", async () => {
  const result = await tryInstagramOAuthTestConnection(
    { tenantId: TENANT },
    {
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection(),
        findById: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => [
          {
            id: "cred-1",
            tenantId: TENANT,
            channelConnectionId: CONNECTION,
            provider: "INSTAGRAM",
            authFamily: "INSTAGRAM_BUSINESS_LOGIN",
            credentialStatus: "ACTIVE",
            providerInstagramAccountId: "17841400000000001",
            providerUserId: "17841400000000001",
            verifiedUsername: "brand",
            verifiedAccountType: "BUSINESS",
            identityVerifiedAt: null,
            tokenExpiresAt: "2030-01-01T00:00:00.000Z",
            refreshEligibleAt: null,
            lastRefreshAt: null,
            lastRefreshStatus: "NEVER",
            connectionHealthStatus: "HEALTHY",
            credentialVersion: 1,
            connectedAt: null,
            revokedAt: null,
            reauthRequiredAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        findActiveByConnection: async () => ({
          id: "cred-1",
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          provider: "INSTAGRAM",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          credentialStatus: "ACTIVE",
          providerInstagramAccountId: "17841400000000001",
          providerUserId: "17841400000000001",
          verifiedUsername: "brand",
          verifiedAccountType: "BUSINESS",
          identityVerifiedAt: null,
          tokenExpiresAt: "2030-01-01T00:00:00.000Z",
          refreshEligibleAt: null,
          lastRefreshAt: null,
          lastRefreshStatus: "NEVER",
          connectionHealthStatus: "HEALTHY",
          credentialVersion: 1,
          connectedAt: null,
          revokedAt: null,
          reauthRequiredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }),
        retrieveDecryptedMaterial: async () => ({
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          credentialId: "cred-1",
          accessToken: "oauth-token",
          tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          credentialVersion: 1
        })
      } as never,
      identityClient: {
        getOwnProfessionalAccount: async () => ({
          professionalAccountId: "17841400000000099" as never,
          username: "other.brand" as never,
          accountType: "BUSINESS"
        })
      },
      env: {
        HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
        HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "true"
      }
    }
  );

  assert.ok(result);
  assert.equal(result?.ok, false);
  assert.match(result?.lastError ?? "", /mismatch/i);
});
