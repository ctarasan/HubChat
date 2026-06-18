import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type {
  ChannelConnectionRepository,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import { createInstagramConnectionCredentialResolver } from "./resolveInstagramConnectionCredential.js";
import {
  InstagramConnectionNotFoundError,
  InstagramOAuthCredentialExpiredError,
  InstagramOAuthCredentialReauthRequiredError,
  InstagramOAuthCredentialTemporarilyUnavailableError,
  InstagramOAuthCredentialUnavailableError,
  InstagramOAuthRuntimeDisabledError,
  InstagramOAuthTestConnectionDisabledError
} from "../../lib/instagramOAuthResolverErrors.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "da92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const OTHER_CONNECTION = "dd222222-2222-4222-8222-222222222222";
const CREDENTIAL = "ee333333-3333-4333-8333-333333333333";

const ENABLED_ENV = {
  HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
  HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true"
};

function buildConnection(overrides?: Partial<ChannelConnectionRecord>): ChannelConnectionRecord {
  return {
    id: CONNECTION,
    tenantId: TENANT,
    provider: "INSTAGRAM",
    status: "READY",
    providerAccountId: null,
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: "ig-account-123",
    publicConnectionKey: "ccp_test_key_01",
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
    updatedAt: new Date(),
    ...overrides
  };
}

function buildRepos(input?: {
  credentialStatus?: string;
  credentialVersion?: number;
  tokenExpiresAt?: string | null;
  connection?: ChannelConnectionRecord | null;
  otherTenantConnection?: boolean;
}) {
  const credentialStatus = input?.credentialStatus ?? "ACTIVE";
  const credentialVersion = input?.credentialVersion ?? 4;
  const tokenExpiresAt = input?.tokenExpiresAt ?? "2030-01-01T00:00:00.000Z";

  const channelConnectionRepository: ChannelConnectionRepository = {
    findById: async (tenantId, connectionId) => {
      if (tenantId === OTHER_TENANT) return null;
      if (connectionId === OTHER_CONNECTION) return null;
      return input?.connection === null ? null : buildConnection(input?.connection);
    }
  } as ChannelConnectionRepository;

  const instagramOAuthCredentialRepository: InstagramOAuthCredentialRepository = {
    findActiveByConnection: async ({ tenantId, channelConnectionId }) => {
      if (tenantId !== TENANT || channelConnectionId !== CONNECTION) return null;
      return {
        id: CREDENTIAL,
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        provider: "INSTAGRAM",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        credentialStatus: credentialStatus as "ACTIVE",
        providerInstagramAccountId: "ig-account-123",
        providerUserId: "meta-user-456",
        verifiedUsername: "brand",
        verifiedAccountType: "BUSINESS",
        identityVerifiedAt: null,
        tokenExpiresAt,
        refreshEligibleAt: null,
        lastRefreshAt: null,
        lastRefreshStatus: "NEVER",
        connectionHealthStatus: "HEALTHY",
        credentialVersion,
        connectedAt: null,
        revokedAt: null,
        reauthRequiredAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    },
    retrieveDecryptedMaterial: async ({ tenantId, channelConnectionId, credentialId }) => {
      if (tenantId !== TENANT || channelConnectionId !== CONNECTION || credentialId !== CREDENTIAL) {
        return null;
      }
      return {
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        credentialId: CREDENTIAL,
        accessToken: "test-instagram-access-token",
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
        credentialVersion
      };
    }
  } as InstagramOAuthCredentialRepository;

  return { channelConnectionRepository, instagramOAuthCredentialRepository };
}

function createResolver(repos: ReturnType<typeof buildRepos>, now?: Date) {
  return createInstagramConnectionCredentialResolver({
    ...repos,
    env: ENABLED_ENV,
    now: () => now ?? new Date("2026-06-01T00:00:00.000Z")
  });
}

const resolveInput = {
  tenantId: TENANT,
  channelConnectionId: CONNECTION,
  expectedAuthFamily: "INSTAGRAM_BUSINESS_LOGIN" as const,
  expectedDeliveryPath: "DATABASE_ONLY" as const
};

test("active credential resolves with latest version", async () => {
  const resolver = createResolver(buildRepos({ credentialVersion: 5 }));
  const resolved = await resolver.resolveForDelivery(resolveInput);
  assert.equal(resolved.credentialVersion, 5);
  assert.equal(resolved.accessToken, "test-instagram-access-token");
  assert.equal(resolved.channelConnectionId, CONNECTION);
  assert.equal(JSON.stringify(resolved).includes("ciphertext"), false);
});

test("runtime disabled when flags absent", async () => {
  const resolver = createInstagramConnectionCredentialResolver({
    ...buildRepos(),
    env: {}
  });
  await assert.rejects(
    () => resolver.resolveForDelivery(resolveInput),
    InstagramOAuthRuntimeDisabledError
  );
});

test("wrong tenant connection not found", async () => {
  const resolver = createResolver(buildRepos());
  await assert.rejects(
    () =>
      resolver.resolveForDelivery({
        ...resolveInput,
        tenantId: OTHER_TENANT
      }),
    InstagramConnectionNotFoundError
  );
});

test("wrong connection id not found", async () => {
  const resolver = createResolver(buildRepos());
  await assert.rejects(
    () =>
      resolver.resolveForDelivery({
        ...resolveInput,
        channelConnectionId: OTHER_CONNECTION
      }),
    InstagramConnectionNotFoundError
  );
});

test("expired token rejected", async () => {
  const resolver = createResolver(
    buildRepos({ tokenExpiresAt: "2020-01-01T00:00:00.000Z" }),
    new Date("2026-06-01T00:00:00.000Z")
  );
  await assert.rejects(
    () => resolver.resolveForDelivery(resolveInput),
    InstagramOAuthCredentialExpiredError
  );
});

test("TOKEN_EXPIRING with valid expiry resolves", async () => {
  const resolver = createResolver(
    buildRepos({ credentialStatus: "TOKEN_EXPIRING", tokenExpiresAt: "2030-01-01T00:00:00.000Z" })
  );
  const resolved = await resolver.resolveForDelivery(resolveInput);
  assert.equal(resolved.credentialVersion, 4);
});

test("REFRESHING is retryable unavailable", async () => {
  const resolver = createResolver(buildRepos({ credentialStatus: "REFRESHING" }));
  await assert.rejects(
    () => resolver.resolveForDelivery(resolveInput),
    InstagramOAuthCredentialTemporarilyUnavailableError
  );
});

test("REAUTH_REQUIRED classified", async () => {
  const resolver = createResolver(buildRepos({ credentialStatus: "REAUTH_REQUIRED" }));
  await assert.rejects(
    () => resolver.resolveForDelivery(resolveInput),
    InstagramOAuthCredentialReauthRequiredError
  );
});

test("DISCONNECTED rejected without switching connection", async () => {
  const resolver = createResolver(buildRepos({ credentialStatus: "DISCONNECTED" }));
  await assert.rejects(
    () => resolver.resolveForDelivery(resolveInput),
    InstagramOAuthCredentialUnavailableError
  );
});

test("rotated credential version returned at execution time", async () => {
  const repos = buildRepos({ credentialVersion: 4 });
  const resolver = createResolver(repos);
  const first = await resolver.resolveForDelivery(resolveInput);
  assert.equal(first.credentialVersion, 4);

  const resolverAfterRotation = createResolver(buildRepos({ credentialVersion: 5 }));
  const second = await resolverAfterRotation.resolveForDelivery(resolveInput);
  assert.equal(second.credentialVersion, 5);
});

test("resolver error does not include access token", async () => {
  const resolver = createResolver(buildRepos({ credentialStatus: "PENDING" }));
  try {
    await resolver.resolveForDelivery(resolveInput);
    assert.fail("expected error");
  } catch (err) {
    assert.equal(String(err).includes("test-instagram-access-token"), false);
  }
});

test("resolveForConnectionTest requires test-connection flag", async () => {
  const resolver = createResolver(buildRepos());
  await assert.rejects(
    () => resolver.resolveForConnectionTest(resolveInput),
    InstagramOAuthTestConnectionDisabledError
  );
});

test("resolveForConnectionTest succeeds when test flag enabled", async () => {
  const resolver = createInstagramConnectionCredentialResolver({
    ...buildRepos(),
    env: {
      HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
      HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED: "true"
    }
  });
  const resolved = await resolver.resolveForConnectionTest(resolveInput);
  assert.equal(resolved.providerInstagramAccountId, "ig-account-123");
});

test("worker main does not wire Instagram OAuth connection resolver", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../worker/main.ts"),
    "utf8"
  );
  assert.equal(source.includes("createInstagramConnectionCredentialResolver"), false);
  assert.equal(source.includes("resolveInstagramConnectionCredential"), false);
});
