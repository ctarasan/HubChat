import test from "node:test";
import assert from "node:assert/strict";
import { FacebookOAuthService } from "./facebookOAuthService.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { OAuthTransactionRecord } from "../../domain/oauthTransactions.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "507d5519-8f4f-4973-99f1-7b00af25279d";
const PAGE_ID = "541846535686129";
const TEST_KEY = "b".repeat(64);

const auth = {
  tenantId: TENANT,
  role: "ADMIN" as const,
  userId: "auth-user-1",
  email: "admin@test.com",
  salesAgentId: AGENT
};

function connection(overrides: Partial<ChannelConnectionRecord> = {}): ChannelConnectionRecord {
  const now = new Date("2026-06-16T08:56:49.000Z");
  return {
    id: CONNECTION_ID,
    tenantId: TENANT,
    provider: "FACEBOOK",
    status: "AUTHORIZING",
    providerAccountId: PAGE_ID,
    providerAccountName: "SMARTKORP",
    providerPageId: PAGE_ID,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test_public_key_123456",
    webhookEndpoint: "https://example.com/api/webhook/facebook",
    webhookActive: true,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: now,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: AGENT,
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function transaction(overrides: Partial<OAuthTransactionRecord> = {}): OAuthTransactionRecord {
  const now = new Date("2026-07-30T02:00:00.000Z");
  return {
    id: "tx-reauth",
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    provider: "FACEBOOK",
    stateHash: "hash",
    resumeSessionHash: "resume-hash",
    status: "PAGES_READY",
    intent: "REAUTHORIZE",
    expectedPageId: PAGE_ID,
    initiatedByAuthUserId: auth.userId,
    initiatedBySalesAgentId: AGENT,
    userTokenExpiresAt: null,
    pageCandidatesJson: [
      {
        pageId: PAGE_ID,
        name: "SMARTKORP",
        tasks: ["MESSAGING"],
        selectable: true,
        reasonCode: null,
        alreadyConnected: true
      },
      {
        pageId: "other-page",
        name: "Other",
        tasks: ["MESSAGING"],
        selectable: true,
        reasonCode: null,
        alreadyConnected: false
      }
    ],
    selectedPageId: null,
    errorCategory: null,
    callbackReceivedAt: now,
    consumedAt: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function oauthConfig() {
  return {
    appId: "943662608544465",
    appSecret: "test-secret",
    graphVersion: "v25.0",
    callbackUrl: "https://example.com/api/channel-connect/facebook/oauth/callback",
    appBaseUrl: "https://example.com",
    oauthEnabled: true,
    credentialEncryptionConfigured: true
  };
}

test("complete rejects Page mismatch without replacing credentials", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.FACEBOOK_APP_ID = "943662608544465";
  process.env.FACEBOOK_APP_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_BASE_URL = "https://example.com";
  process.env.HUBCHAT_FACEBOOK_OAUTH_ENABLED = "true";

  let storedCredential = false;
  let restoredReady = false;
  let failedCategory: string | null = null;
  const conn = connection({ status: "AUTHORIZING" });

  const service = new FacebookOAuthService({
    config: oauthConfig(),
    channelConnectionRepository: {
      findById: async () => conn,
      findByTenantAndProvider: async () => conn,
      updateLifecycleStatus: async (input: { status: string }) => {
        if (input.status === "READY") restoredReady = true;
        return { ...conn, status: input.status as ChannelConnectionRecord["status"] };
      },
      updateHealthFields: async () => conn,
      storeEncryptedCredential: async () => {
        storedCredential = true;
        throw new Error("should not store");
      },
      listCredentialMetadataByConnection: async () => []
    } as any,
    oauthTransactionRepository: {
      findActiveByResumeSessionHash: async () => transaction(),
      findLatestActiveForConnectionAndUser: async () => transaction(),
      getDecryptedUserToken: async () => "user-token",
      updateTransaction: async (input: { errorCategory?: string | null; status: string }) => {
        failedCategory = input.errorCategory ?? null;
        return transaction({ status: input.status as OAuthTransactionRecord["status"] });
      }
    } as any,
    channelSettingRepository: {
      findByTenantAndChannel: async () => null
    } as any
  });

  await assert.rejects(
    () => service.complete(auth, "resume-hash", "other-page"),
    /does not match the linked Facebook Page/
  );
  assert.equal(storedCredential, false);
  assert.equal(restoredReady, true);
  assert.equal(failedCategory, "PAGE_MISMATCH");
});

test("startReauthorize requires READY OAuth-managed connection with Page", async () => {
  process.env.HUBCHAT_FACEBOOK_OAUTH_ENABLED = "true";
  const conn = connection({ status: "READY" });
  const created = {
    intent: null as string | null,
    expectedPageId: null as string | null
  };
  const service = new FacebookOAuthService({
    config: oauthConfig(),
    channelConnectionRepository: {
      findByTenantAndProvider: async () => conn,
      listCredentialMetadataByConnection: async () => [
        {
          connectionId: CONNECTION_ID,
          provider: "FACEBOOK",
          credentialType: "ACCESS_TOKEN",
          credentialState: "SET",
          secretFingerprint: "fp",
          tokenExpiresAt: null,
          updatedAt: new Date().toISOString()
        }
      ],
      updateLifecycleStatus: async (input: { status: string; allowReadyReauthorize?: boolean }) => {
        assert.equal(input.allowReadyReauthorize, true);
        return { ...conn, status: "AUTHORIZING" };
      },
      updateHealthFields: async () => conn
    } as any,
    oauthTransactionRepository: {
      expireActiveTransactionsForConnection: async () => 1,
      createTransaction: async (input: { intent?: string; expectedPageId?: string | null }) => {
        created.intent = input.intent ?? null;
        created.expectedPageId = input.expectedPageId ?? null;
        return { id: "tx" };
      }
    } as any,
    channelSettingRepository: {} as any
  });

  const result = await service.startReauthorize(auth);
  assert.equal(result.expectedPageId, PAGE_ID);
  assert.match(result.authorizeUrl, /auth_type=rerequest/);
  assert.equal(created.intent, "REAUTHORIZE");
  assert.equal(created.expectedPageId, PAGE_ID);
});
