import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { ChannelSettingPublicDto } from "../../domain/channelSettings.js";
import type { InstagramOAuthCredentialMetadata } from "../../domain/instagramOAuthCredentials.js";
import { TestChannelConnectionUseCase } from "./testChannelConnection.js";

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

function instagramSetting(overrides: Partial<ChannelSettingPublicDto> = {}): ChannelSettingPublicDto {
  return {
    channel: "INSTAGRAM",
    enabled: true,
    configured: true,
    status: "READY",
    providerPageId: null,
    providerAccountName: null,
    lastVerifiedAt: null,
    lastError: null,
    updatedAt: "2026-06-21T00:00:00.000Z",
    secretState: { accessToken: "EMPTY", channelSecret: "EMPTY" },
    displayName: "Instagram",
    configJson: {},
    secretsConfigured: [],
    ...overrides
  };
}

function oauthCredential(
  overrides: Partial<InstagramOAuthCredentialMetadata> = {}
): InstagramOAuthCredentialMetadata {
  return {
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
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function buildUseCase(input: {
  env?: Record<string, string | undefined>;
  legacyConfigured?: boolean;
  oauthCredentials?: InstagramOAuthCredentialMetadata[];
  verifyChannelHealth?: () => Promise<{ ok: boolean; message: string }>;
}) {
  let legacyRuntimeCalls = 0;
  let healthMutations = 0;
  let legacyVerifierCalls = 0;

  const verifyChannelHealth =
    input.verifyChannelHealth ??
    (async () => {
      legacyVerifierCalls += 1;
      return { ok: true, message: "legacy probe should not run" };
    });

  const useCase = new TestChannelConnectionUseCase(
    {
      findByTenantAndChannel: async () =>
        instagramSetting({
          configured: input.legacyConfigured ?? false,
          secretState: { accessToken: input.legacyConfigured ? "SET" : "EMPTY", channelSecret: "EMPTY" }
        }),
      getRuntimeConfigForConnectionTest: async () => {
        legacyRuntimeCalls += 1;
        if (!input.legacyConfigured) return null;
        return {
          tenantId: TENANT,
          channel: "INSTAGRAM" as const,
          enabled: true,
          providerPageId: "page-1",
          providerAccountName: null,
          secrets: { accessToken: "legacy-page-token" }
        };
      },
      updateConnectionHealth: async () => {
        healthMutations += 1;
        return instagramSetting();
      }
    } as never,
    {
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => input.oauthCredentials ?? [oauthCredential()],
        findActiveByConnection: async () => {
          throw new Error("OAuth resolver must not run when test flag is OFF");
        },
        retrieveDecryptedMaterial: async () => {
          throw new Error("OAuth decrypt must not run when test flag is OFF");
        }
      } as never
    }
  );

  return {
    useCase,
    metrics: () => ({ legacyRuntimeCalls, healthMutations, legacyVerifierCalls })
  };
}

for (const flagValue of [undefined, "", "false", "off"] as const) {
  const label = flagValue === undefined ? "absent" : JSON.stringify(flagValue);
  test(`OAuth-managed Instagram with test flag ${label} returns DISABLED without legacy fallthrough`, async () => {
    const env: Record<string, string | undefined> = {};
    if (flagValue !== undefined) {
      env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED = flagValue;
    }
    const previous = process.env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED;
    if (flagValue === undefined) {
      delete process.env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED;
    } else {
      process.env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED = flagValue;
    }

    try {
      const { useCase, metrics } = buildUseCase({ legacyConfigured: false });
      const result = await useCase.execute({ tenantId: TENANT, channel: "INSTAGRAM" });
      assert.equal(result.ok, false);
      assert.equal(result.status, "DISABLED");
      assert.equal(metrics().legacyVerifierCalls, 0);
      assert.equal(metrics().healthMutations, 0);
    } finally {
      if (previous === undefined) {
        delete process.env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED;
      } else {
        process.env.HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED = previous;
      }
    }
  });
}

test("legacy Instagram connection keeps legacy Test Connection behavior", async () => {
  let legacyVerifierCalls = 0;
  const useCase = new TestChannelConnectionUseCase(
    {
      findByTenantAndChannel: async () =>
        instagramSetting({
          configured: true,
          secretState: { accessToken: "SET", channelSecret: "EMPTY" }
        }),
      getRuntimeConfigForConnectionTest: async () => ({
        tenantId: TENANT,
        channel: "INSTAGRAM" as const,
        enabled: true,
        providerPageId: "page-1",
        providerAccountName: null,
        secrets: { accessToken: "legacy-page-token" }
      }),
      updateConnectionHealth: async () => instagramSetting({ lastVerifiedAt: "2026-06-21T12:00:00.000Z" })
    } as never,
    {
      verifyChannelHealth: async () => {
        legacyVerifierCalls += 1;
        return { ok: true, message: "Instagram legacy connection verified." };
      },
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => []
      } as never
    }
  );

  const result = await useCase.execute({ tenantId: TENANT, channel: "INSTAGRAM" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "READY");
  assert.equal(legacyVerifierCalls, 1);
});

test("ambiguous OAuth plus legacy configuration fails closed without provider probes", async () => {
  let legacyVerifierCalls = 0;
  let legacyRuntimeCalls = 0;
  const useCase = new TestChannelConnectionUseCase(
    {
      findByTenantAndChannel: async () =>
        instagramSetting({
          configured: true,
          secretState: { accessToken: "SET", channelSecret: "EMPTY" }
        }),
      getRuntimeConfigForConnectionTest: async () => {
        legacyRuntimeCalls += 1;
        return {
          tenantId: TENANT,
          channel: "INSTAGRAM" as const,
          enabled: true,
          providerPageId: "page-1",
          providerAccountName: null,
          secrets: { accessToken: "legacy-page-token" }
        };
      },
      updateConnectionHealth: async () => instagramSetting()
    } as never,
    {
      verifyChannelHealth: async () => {
        legacyVerifierCalls += 1;
        return { ok: true, message: "must not run" };
      },
      channelConnectionRepository: {
        findByTenantAndProvider: async () => instagramConnection()
      } as never,
      instagramOAuthCredentialRepository: {
        findByConnection: async () => [oauthCredential()],
        findActiveByConnection: async () => {
          throw new Error("OAuth resolver must not run for ambiguous configuration");
        },
        retrieveDecryptedMaterial: async () => {
          throw new Error("OAuth decrypt must not run for ambiguous configuration");
        }
      } as never
    }
  );

  const result = await useCase.execute({ tenantId: TENANT, channel: "INSTAGRAM" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "ERROR");
  assert.match(result.lastError ?? "", /ambiguous/i);
  assert.equal(legacyVerifierCalls, 0);
  assert.equal(legacyRuntimeCalls, 1);
});
