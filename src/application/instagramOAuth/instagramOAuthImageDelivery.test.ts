import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type {
  ChannelConnectionRepository,
  InstagramConnectionCredentialResolver,
  InstagramOAuthCredentialRepository
} from "../../domain/ports.js";
import { InstagramOAuthMessagingError } from "../../infrastructure/adapters/meta/instagramOAuthMessagingClient.js";
import { InstagramOAuthImageDeliveryError } from "../../lib/instagramOAuthImageDeliveryErrors.js";
import { createInstagramOAuthImageDeliveryService } from "./instagramOAuthImageDelivery.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";
const CREDENTIAL = "ee333333-3333-4333-8333-333333333333";
const RECIPIENT = "959986016929726";
const IMAGE_URL = "https://cdn.example.test/outbound/photo.jpg";

const ENABLED_ENV = {
  HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED: "true",
  HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED: "true",
  HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_IMAGE_ENABLED: "true"
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
  imageUrl: IMAGE_URL,
  mediaMimeType: "image/jpeg",
  fileSizeBytes: 1024,
  idempotencyKey: `${TENANT}:msg-img-123`
};

test("image flag OFF fail closed", async () => {
  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos(),
    env: {}
  });
  await assert.rejects(
    () => service.sendImage(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthImageDeliveryError);
      assert.equal(err.failure.code, "OAUTH_RUNTIME_DISABLED");
      return true;
    }
  );
});

test("missing channel_connection_id fail closed", async () => {
  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendImage({ ...baseInput, channelConnectionId: "  " }),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthImageDeliveryError);
      assert.equal(err.failure.code, "CHANNEL_CONNECTION_REQUIRED");
      return true;
    }
  );
});

test("invalid URL rejected before provider call", async () => {
  let providerCalled = false;
  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV,
    messagingClient: {
      sendTextMessage: async () => {
        throw new Error("not used");
      },
      sendImageMessage: async () => {
        providerCalled = true;
        return { externalMessageId: "mid.oauth.img" };
      }
    }
  });
  await assert.rejects(
    () =>
      service.sendImage({
        ...baseInput,
        imageUrl: "http://cdn.example.test/photo.jpg"
      }),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthImageDeliveryError);
      assert.equal(err.failure.code, "IMAGE_URL_INVALID");
      assert.equal(String(err.failure.logFields.imageUrlMasked).includes("X-Amz-Signature"), false);
      return true;
    }
  );
  assert.equal(providerCalled, false);
});

test("ACTIVE credential sends image through mocked provider client", async () => {
  let resolverCalls = 0;
  let messagingCalls = 0;
  const credentialResolver: InstagramConnectionCredentialResolver = {
    resolveForDelivery: async (input) => {
      resolverCalls += 1;
      assert.equal(input.channelConnectionId, CONNECTION);
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

  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV,
    credentialResolver,
    messagingClient: {
      sendTextMessage: async () => {
        throw new Error("not used");
      },
      sendImageMessage: async (request) => {
        messagingCalls += 1;
        assert.equal(request.imageUrl, IMAGE_URL);
        assert.equal(request.recipientMessagingScopedUserId, RECIPIENT);
        return { externalMessageId: "mid.oauth.image.123" };
      }
    }
  });

  const result = await service.sendImage(baseInput);
  assert.equal(resolverCalls, 1);
  assert.equal(messagingCalls, 1);
  assert.equal(result.externalMessageId, "mid.oauth.image.123");
  assert.equal(JSON.stringify(result).includes("test-instagram-access-token"), false);
  assert.equal(result.imageUrlHost, "cdn.example.test");
});

test("REAUTH_REQUIRED fail closed", async () => {
  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos({ credentialStatus: "REAUTH_REQUIRED" }),
    env: ENABLED_ENV
  });
  await assert.rejects(
    () => service.sendImage(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthImageDeliveryError);
      assert.equal(err.failure.code, "REAUTH_REQUIRED");
      return true;
    }
  );
});

test("provider unsupported media maps to terminal failure", async () => {
  const service = createInstagramOAuthImageDeliveryService({
    ...buildRepos(),
    env: ENABLED_ENV,
    messagingClient: {
      sendTextMessage: async () => {
        throw new Error("not used");
      },
      sendImageMessage: async () => {
        throw new InstagramOAuthMessagingError("Invalid image URL", "UNSUPPORTED_MEDIA", 400);
      }
    }
  });
  await assert.rejects(
    () => service.sendImage(baseInput),
    (err: unknown) => {
      assert.ok(err instanceof InstagramOAuthImageDeliveryError);
      assert.equal(err.failure.code, "UNSUPPORTED_MEDIA");
      assert.equal(err.failure.retryable, false);
      return true;
    }
  );
});

test("worker main does not wire Instagram OAuth image delivery service", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../worker/main.ts"),
    "utf8"
  );
  assert.equal(source.includes("instagramOAuthImageDelivery"), false);
  assert.equal(source.includes("createInstagramOAuthImageDeliveryService"), false);
});

test("OAuth text delivery module unchanged by image service", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const textSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "./instagramOAuthTextDelivery.ts"),
    "utf8"
  );
  assert.equal(textSource.includes("sendImage"), false);
  assert.match(textSource, /sendText/);
});
