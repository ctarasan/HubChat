import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type {
  ChannelConnectionRepository,
  InstagramConnectionCredentialResolver,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import { InstagramOAuthTextDeliveryError } from "../../lib/instagramOAuthTextDeliveryErrors.js";
import { InstagramOAuthMessagingError } from "../../infrastructure/adapters/meta/instagramOAuthMessagingClient.js";
import { createInstagramOAuthTextDeliveryService } from "./instagramOAuthTextDelivery.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const CREDENTIAL = "ee333333-3333-4333-8333-333333333333";
const RECIPIENT = "959986016929726";

const ENABLED_ENV = {
  HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
  HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
  HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED: "true"
};

function buildConnection(): ChannelConnectionRecord {
  return {
    id: CONNECTION,
    tenantId: TENANT,
    provider: "INSTAGRAM",
    status: "READY",
    providerAccountId: null,
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: "17841400000000000",
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
    updatedAt: new Date()
  };
}

function buildRepos(input?: { credentialStatus?: string; tokenExpiresAt?: string | null }) {
  const credentialStatus = input?.credentialStatus ?? "ACTIVE";
  const tokenExpiresAt = input?.tokenExpiresAt ?? "2030-01-01T00:00:00.000Z";

  const channelConnectionRepository: ChannelConnectionRepository = {
    findById: async (tenantId, connectionId) => {
      if (tenantId !== TENANT || connectionId !== CONNECTION) return null;
      return buildConnection();
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
        providerInstagramAccountId: "17841400000000000",
        providerUserId: "meta-user-456",
        verifiedUsername: "brand",
        verifiedAccountType: "BUSINESS",
        identityVerifiedAt: null,
        tokenExpiresAt,
        refreshEligibleAt: null,
        lastRefreshAt: null,
        lastRefreshStatus: "NEVER",
        connectionHealthStatus: "HEALTHY",
        credentialVersion: 4,
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
        credentialVersion: 4
      };
    }
  } as InstagramOAuthCredentialRepository;

  return { channelConnectionRepository, instagramOAuthCredentialRepository };
}

const baseInput = {
  tenantId: TENANT,
  channelConnectionId: CONNECTION,
  conversationId: "conv-123",
  recipientMessagingScopedUserId: RECIPIENT,
  messageText: "Hello OAuth",
  idempotencyKey: `${TENANT}:msg-123`
};

test("runtime/outbound text flags OFF fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: {}
  });
  await assert.rejects(
    () => service.sendText(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "OAUTH_RUNTIME_DISABLED");
      return true;
    }
  );
});

test("missing channel_connection_id fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendText({ ...baseInput, channelConnectionId: "   " }),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "CHANNEL_CONNECTION_REQUIRED");
      return true;
    }
  );
});

test("ACTIVE credential sends text through mocked messaging client", async () => {
  let resolverCalls = 0;
  let messagingCalls = 0;
  const credentialResolver: InstagramConnectionCredentialResolver = {
    resolveForDelivery: async (input) => {
      resolverCalls += 1;
      assert.equal(input.channelConnectionId, CONNECTION);
      assert.equal(input.expectedAuthFamily, "INSTAGRAM_BUSINESS_LOGIN");
      assert.equal(input.expectedDeliveryPath, "DATABASE_ONLY");
      return {
        credentialId: CREDENTIAL,
        credentialVersion: 4,
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        providerInstagramAccountId: "17841400000000000",
        providerUserId: "meta-user-456",
        authFamily: "INSTAGRAM_BUSINESS_LOGIN",
        accessToken: "test-instagram-access-token",
        tokenExpiresAt: new Date("2030-01-01T00:00:00.000Z")
      };
    },
    resolveForConnectionTest: async () => {
      throw new Error("not used");
    }
  };

  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV,
    credentialResolver,
    messagingClient: {
      sendTextMessage: async (request) => {
        messagingCalls += 1;
        assert.equal(request.professionalAccountId, "17841400000000000");
        assert.equal(request.recipientMessagingScopedUserId, RECIPIENT);
        assert.equal(request.messageText, "Hello OAuth");
        assert.equal(request.accessToken, "test-instagram-access-token");
        return { externalMessageId: "mid.oauth.789" };
      }
    }
  });

  const result = await service.sendText(baseInput);
  assert.equal(resolverCalls, 1);
  assert.equal(messagingCalls, 1);
  assert.equal(result.externalMessageId, "mid.oauth.789");
  assert.equal(result.channelConnectionId, CONNECTION);
  assert.equal(JSON.stringify(result).includes("test-instagram-access-token"), false);
});

test("TOKEN_EXPIRING credential sends text when resolver allows", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos({ credentialStatus: "TOKEN_EXPIRING" }),
    env: ENABLED_ENV,
    messagingClient: {
      sendTextMessage: async () => ({ externalMessageId: "mid.oauth.expiring" })
    }
  });
  const result = await service.sendText(baseInput);
  assert.equal(result.externalMessageId, "mid.oauth.expiring");
});

test("REAUTH_REQUIRED fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos({ credentialStatus: "REAUTH_REQUIRED" }),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendText(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "REAUTH_REQUIRED");
      return true;
    }
  );
});

test("expired token fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos({ tokenExpiresAt: "2020-01-01T00:00:00.000Z" }),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendText(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "TOKEN_EXPIRED");
      return true;
    }
  );
});

test("credential not found fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos({ credentialStatus: "DISCONNECTED" }),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendText(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "CREDENTIAL_NOT_FOUND");
      return true;
    }
  );
});

test("username recipient fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendText({ ...baseInput, recipientMessagingScopedUserId: "@brand" }),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "RECIPIENT_UNAVAILABLE");
      return true;
    }
  );
});

test("professional account ID as recipient fail closed", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () =>
      service.sendText({
        ...baseInput,
        recipientMessagingScopedUserId: "17841400000000000"
      }),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "CONFIGURATION_AMBIGUOUS");
      return true;
    }
  );
});

test("provider rate limit maps to retryable failure", async () => {
  const service = createInstagramOAuthTextDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV,
    messagingClient: {
      sendTextMessage: async () => {
        throw new InstagramOAuthMessagingError("Rate limited", "RATE_LIMITED", 429);
      }
    }
  });
  await assert.rejects(
    () => service.sendText(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthTextDeliveryError);
      assert.equal(err.failure.code, "RATE_LIMITED");
      assert.equal(err.failure.retryable, true);
      return true;
    }
  );
});

test("worker main does not wire Instagram OAuth text delivery service", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../worker/main.ts"),
    "utf8"
  );
  assert.equal(source.includes("instagramOAuthTextDelivery"), false);
  assert.equal(source.includes("createInstagramOAuthTextDeliveryService"), false);
});

test("legacy instagram adapter source unchanged by OAuth text delivery module", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const legacy = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../infrastructure/adapters/channels/instagramAdapter.ts"
    ),
    "utf8"
  );
  assert.equal(legacy.includes("instagramOAuthTextDelivery"), false);
  assert.match(legacy, /graph\.facebook\.com/);
});
