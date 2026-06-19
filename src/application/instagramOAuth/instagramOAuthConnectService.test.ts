import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { InstagramOAuthCredentialMetadata } from "../../domain/instagramOAuthCredentials.js";
import type { InstagramOAuthStateRecord } from "../../domain/instagramOAuthStates.js";
import { InstagramOAuthConnectService } from "./instagramOAuthConnectService.js";
import { hashInstagramOAuthState } from "../../lib/instagramOAuthSecurity.js";
import type { InstagramOAuthProviderClient } from "../../infrastructure/adapters/meta/instagramBusinessLoginOAuth.js";
import type { InstagramProfessionalIdentityClient } from "../../infrastructure/adapters/meta/instagramProfessionalIdentity.js";
import {
  asInstagramProfessionalAccountId,
  asInstagramUsername
} from "../../domain/instagramIdentity.js";
import { InstagramOAuthStateConflictError } from "../../infrastructure/adapters/repositories/supabaseInstagramOAuthStateRepository.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";
const TEST_KEY = "c".repeat(64);

const adminAuth = {
  tenantId: TENANT,
  role: "ADMIN" as const,
  userId: "auth-user-1",
  email: "admin@test.com",
  salesAgentId: AGENT
};

function baseConnection(overrides: Partial<ChannelConnectionRecord> = {}): ChannelConnectionRecord {
  const now = new Date("2026-06-20T10:00:00.000Z");
  return {
    id: CONNECTION,
    tenantId: TENANT,
    provider: "INSTAGRAM",
    status: "DRAFT",
    providerAccountId: null,
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_test_public_key_123456",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: AGENT,
    connectedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function setupEnv() {
  process.env.HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED = "true";
  process.env.META_APP_ID = "1234567890";
  process.env.FACEBOOK_APP_SECRET = "test-app-secret";
  process.env.NEXT_PUBLIC_APP_BASE_URL = "https://smartkorp-hub-chat.vercel.app";
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
}

function buildService(overrides?: {
  connection?: ChannelConnectionRecord | null;
  activeCredential?: InstagramOAuthCredentialMetadata | null;
  providerClient?: InstagramOAuthProviderClient;
  identityClient?: InstagramProfessionalIdentityClient;
  stateStore?: Map<string, InstagramOAuthStateRecord>;
}) {
  const stateStore = overrides?.stateStore ?? new Map<string, InstagramOAuthStateRecord>();
  const credentials: InstagramOAuthCredentialMetadata[] = [];
  let activateCalls = 0;
  let createPendingCalls = 0;
  const callOrder: string[] = [];
  const providerClient =
    overrides?.providerClient ??
    ({
      buildAuthorizationUrl: ({ state, scopes }) =>
        `https://www.instagram.com/oauth/authorize?client_id=123&redirect_uri=https%3A%2F%2Fsmartkorp-hub-chat.vercel.app%2Fapi%2Fchannel-connect%2Finstagram%2Foauth%2Fcallback&response_type=code&state=${state}&scope=${scopes.join("%2C")}`,
      exchangeAuthorizationCode: async () => {
        callOrder.push("exchangeAuthorizationCode");
        return {
          accessToken: "short-token",
          providerUserId: "17841400000000001",
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_messages"]
        };
      },
      exchangeForLongLivedAccessToken: async () => {
        callOrder.push("exchangeForLongLivedAccessToken");
        return {
          accessToken: "long-lived-token",
          providerUserId: "",
          expiresInSeconds: 5184000
        };
      }
    } satisfies InstagramOAuthProviderClient);

  const identityClient = overrides?.identityClient ?? {
    getOwnProfessionalAccount: async () => {
      callOrder.push("getOwnProfessionalAccount");
      return {
        professionalAccountId: asInstagramProfessionalAccountId("17841400000000001"),
        username: asInstagramUsername("brand.official"),
        accountType: "BUSINESS" as const
      };
    }
  };

  const auditEvents: string[] = [];

  const service = new InstagramOAuthConnectService({
    channelConnectionRepository: {
      findById: async (tenantId: string, connectionId: string) => {
        if (tenantId !== TENANT || connectionId !== CONNECTION) return null;
        return overrides?.connection === null ? null : overrides?.connection ?? baseConnection();
      }
    } as never,
    instagramOAuthStateRepository: {
      createState: async (input) => {
        const record: InstagramOAuthStateRecord = {
          id: "state-1",
          tenantId: input.tenantId,
          channelConnectionId: input.channelConnectionId,
          provider: "INSTAGRAM",
          stateHash: input.stateHash,
          returnDestination: input.returnDestination,
          requestedScopes: input.requestedScopes,
          status: "PENDING",
          initiatedByAuthUserId: input.initiatedByAuthUserId,
          initiatedBySalesAgentId: input.initiatedBySalesAgentId,
          failureCode: null,
          claimedAt: null,
          consumedAt: null,
          expiresAt: input.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        stateStore.set(input.stateHash, record);
        return record;
      },
      claimStateAtCallback: async (input) => {
        const existing = stateStore.get(input.stateHash);
        if (!existing || existing.status !== "PENDING" || existing.expiresAt <= input.now) {
          if (existing && existing.status !== "PENDING") {
            throw new InstagramOAuthStateConflictError("replay");
          }
          throw new Error("not found");
        }
        const claimed = { ...existing, status: "CLAIMED" as const, claimedAt: input.now };
        stateStore.set(input.stateHash, claimed);
        return claimed;
      },
      finalizeState: async (input) => {
        const existing = [...stateStore.values()].find((row) => row.id === input.stateId);
        if (!existing) throw new Error("missing");
        const finalized = {
          ...existing,
          status: input.status,
          failureCode: input.failureCode ?? null,
          consumedAt: new Date()
        };
        stateStore.set(existing.stateHash, finalized);
        return finalized;
      }
    },
    instagramOAuthCredentialRepository: {
      findActiveByConnection: async () => overrides?.activeCredential ?? null,
      createPending: async (input: { tenantId: string; channelConnectionId: string; authFamily: string }) => {
        createPendingCalls += 1;
        callOrder.push("createPending");
        const row: InstagramOAuthCredentialMetadata = {
          id: "cred-pending",
          tenantId: input.tenantId,
          channelConnectionId: input.channelConnectionId,
          provider: "INSTAGRAM",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          credentialStatus: "PENDING",
          providerInstagramAccountId: null,
          providerUserId: null,
          verifiedUsername: null,
          verifiedAccountType: null,
          identityVerifiedAt: null,
          tokenExpiresAt: null,
          refreshEligibleAt: null,
          lastRefreshAt: null,
          lastRefreshStatus: "NEVER",
          connectionHealthStatus: "UNKNOWN",
          credentialVersion: 1,
          connectedAt: null,
          revokedAt: null,
          reauthRequiredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        credentials.push(row);
        return row;
      },
      activate: async (input: {
        credentialId: string;
        tenantId: string;
        channelConnectionId: string;
        providerInstagramAccountId: string;
        providerUserId?: string | null;
        verifiedUsername: string;
        verifiedAccountType: "BUSINESS" | "CREATOR";
        identityVerifiedAt: Date;
        tokenExpiresAt: Date;
        refreshEligibleAt: Date;
      }) => {
        activateCalls += 1;
        callOrder.push("activate");
        const row: InstagramOAuthCredentialMetadata = {
          id: input.credentialId,
          tenantId: input.tenantId,
          channelConnectionId: input.channelConnectionId,
          provider: "INSTAGRAM",
          authFamily: "INSTAGRAM_BUSINESS_LOGIN",
          credentialStatus: "ACTIVE",
          providerInstagramAccountId: input.providerInstagramAccountId,
          providerUserId: input.providerUserId ?? null,
          verifiedUsername: input.verifiedUsername,
          verifiedAccountType: input.verifiedAccountType,
          identityVerifiedAt: input.identityVerifiedAt.toISOString(),
          tokenExpiresAt: input.tokenExpiresAt.toISOString(),
          refreshEligibleAt: input.refreshEligibleAt.toISOString(),
          lastRefreshAt: null,
          lastRefreshStatus: "NEVER",
          connectionHealthStatus: "UNKNOWN",
          credentialVersion: 2,
          connectedAt: new Date().toISOString(),
          revokedAt: null,
          reauthRequiredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        credentials.push(row);
        return row;
      }
    } as never,
    providerClient,
    identityClient,
    auditSink: ({ type }) => {
      auditEvents.push(type);
    },
    now: () => new Date("2026-06-20T10:00:00.000Z")
  });

  return { service, stateStore, auditEvents, credentials, activateCalls: () => activateCalls, createPendingCalls: () => createPendingCalls, callOrder };
}

test("startOAuth returns authorization URL without secrets", async () => {
  setupEnv();
  const { service } = buildService();
  const result = await service.startOAuth(adminAuth, { channelConnectionId: CONNECTION });
  assert.match(result.authorizationUrl, /^https:\/\/www\.instagram\.com\/oauth\/authorize/);
  assert.match(result.authorizationUrl, /redirect_uri=/);
  assert.doesNotMatch(result.authorizationUrl, /client_secret|access_token|verifier/i);
  assert.ok(result.expiresAt);
});

test("startOAuth rejects ACTIVE credential", async () => {
  setupEnv();
  const { service } = buildService({
    activeCredential: {
      id: "cred-1",
      tenantId: TENANT,
      channelConnectionId: CONNECTION,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      credentialStatus: "ACTIVE",
      providerInstagramAccountId: "17841400000000001",
      providerUserId: "17841400000000001",
      verifiedUsername: "brand.official",
      verifiedAccountType: "BUSINESS",
      identityVerifiedAt: new Date().toISOString(),
      tokenExpiresAt: new Date().toISOString(),
      refreshEligibleAt: new Date().toISOString(),
      lastRefreshAt: null,
      lastRefreshStatus: "NEVER",
      connectionHealthStatus: "HEALTHY",
      credentialVersion: 2,
      connectedAt: new Date().toISOString(),
      revokedAt: null,
      reauthRequiredAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });
  await assert.rejects(
    () => service.startOAuth(adminAuth, { channelConnectionId: CONNECTION }),
    /already has an active credential/i
  );
});

test("callback success persists credential and redirects safely", async () => {
  setupEnv();
  const state = "callback-state-token";
  const stateHash = hashInstagramOAuthState(state);
  const stateStore = new Map<string, InstagramOAuthStateRecord>([
    [
      stateHash,
      {
        id: "state-1",
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        provider: "INSTAGRAM",
        stateHash,
        returnDestination: "CHANNEL_SETTINGS",
        requestedScopes: ["instagram_business_basic"],
        status: "PENDING",
        initiatedByAuthUserId: "auth-user-1",
        initiatedBySalesAgentId: AGENT,
        failureCode: null,
        claimedAt: null,
        consumedAt: null,
        expiresAt: new Date("2026-06-20T10:10:00.000Z"),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);
  const { service, auditEvents, credentials } = buildService({ stateStore });
  const result = await service.handleCallback({ state, code: "provider-code" });
  const url = new URL(result.redirectUrl);
  assert.equal(url.searchParams.get("instagramOAuth"), "connected");
  assert.equal(url.searchParams.get("channel"), "instagram");
  assert.equal(url.searchParams.has("code"), false);
  assert.equal(url.searchParams.has("state"), false);
  assert.ok(auditEvents.includes("INSTAGRAM_OAUTH_CALLBACK_SUCCEEDED"));
  assert.ok(auditEvents.includes("INSTAGRAM_OAUTH_IDENTITY_VERIFIED"));
  assert.equal(credentials.some((row) => row.credentialStatus === "ACTIVE"), true);
});

test("callback denial does not exchange token", async () => {
  setupEnv();
  let exchangeCalls = 0;
  const state = "denied-state";
  const stateHash = hashInstagramOAuthState(state);
  const { service } = buildService({
    stateStore: new Map([
      [
        stateHash,
        {
          id: "state-1",
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          provider: "INSTAGRAM",
          stateHash,
          returnDestination: "CHANNEL_SETTINGS",
          requestedScopes: [],
          status: "PENDING",
          initiatedByAuthUserId: "auth-user-1",
          initiatedBySalesAgentId: AGENT,
          failureCode: null,
          claimedAt: null,
          consumedAt: null,
          expiresAt: new Date("2026-06-20T10:10:00.000Z"),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    ]),
    providerClient: {
      buildAuthorizationUrl: () => "https://www.instagram.com/oauth/authorize",
      exchangeAuthorizationCode: async () => {
        exchangeCalls += 1;
        return { accessToken: "x", providerUserId: "1" };
      },
      exchangeForLongLivedAccessToken: async () => ({ accessToken: "x", providerUserId: "" })
    }
  });

  const result = await service.handleCallback({
    state,
    error: "access_denied",
    error_reason: "user_denied"
  });
  assert.equal(exchangeCalls, 0);
  assert.equal(new URL(result.redirectUrl).searchParams.get("errorCode"), "INSTAGRAM_OAUTH_ACCESS_DENIED");
});

test("callback when connect flag disabled after claim does not exchange token", async () => {
  process.env.HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED = "false";
  const state = "disabled-after-start";
  const stateHash = hashInstagramOAuthState(state);
  let exchangeCalls = 0;
  const { service } = buildService({
    stateStore: new Map([
      [
        stateHash,
        {
          id: "state-1",
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
          provider: "INSTAGRAM",
          stateHash,
          returnDestination: "CHANNEL_SETTINGS",
          requestedScopes: [],
          status: "PENDING",
          initiatedByAuthUserId: "auth-user-1",
          initiatedBySalesAgentId: AGENT,
          failureCode: null,
          claimedAt: null,
          consumedAt: null,
          expiresAt: new Date("2026-06-20T10:10:00.000Z"),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    ]),
    providerClient: {
      buildAuthorizationUrl: () => "https://www.instagram.com/oauth/authorize",
      exchangeAuthorizationCode: async () => {
        exchangeCalls += 1;
        return { accessToken: "x", providerUserId: "1" };
      },
      exchangeForLongLivedAccessToken: async () => ({ accessToken: "x", providerUserId: "" })
    }
  });
  const result = await service.handleCallback({ state, code: "provider-code" });
  assert.equal(exchangeCalls, 0);
  assert.equal(new URL(result.redirectUrl).searchParams.get("errorCode"), "INSTAGRAM_OAUTH_DISABLED");
});

function pendingStateStore(state: string) {
  const stateHash = hashInstagramOAuthState(state);
  return new Map<string, InstagramOAuthStateRecord>([
    [
      stateHash,
      {
        id: "state-1",
        tenantId: TENANT,
        channelConnectionId: CONNECTION,
        provider: "INSTAGRAM",
        stateHash,
        returnDestination: "CHANNEL_SETTINGS",
        requestedScopes: ["instagram_business_basic"],
        status: "PENDING",
        initiatedByAuthUserId: "auth-user-1",
        initiatedBySalesAgentId: AGENT,
        failureCode: null,
        claimedAt: null,
        consumedAt: null,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);
}

test("callback identity mismatch fails closed without activating credential", async () => {
  setupEnv();
  const state = "identity-mismatch-state";
  const { service, credentials, activateCalls, stateStore } = buildService({
    stateStore: pendingStateStore(state),
    providerClient: {
      buildAuthorizationUrl: () => "https://www.instagram.com/oauth/authorize",
      exchangeAuthorizationCode: async () => ({
        accessToken: "short-token",
        providerUserId: "17841400000000001",
        grantedScopes: ["instagram_business_basic"]
      }),
      exchangeForLongLivedAccessToken: async () => ({
        accessToken: "long-lived-token",
        providerUserId: "",
        expiresInSeconds: 5184000
      })
    },
    identityClient: {
      getOwnProfessionalAccount: async () => ({
        professionalAccountId: asInstagramProfessionalAccountId("17841400000000099"),
        username: asInstagramUsername("other.brand"),
        accountType: "BUSINESS"
      })
    }
  });

  const result = await service.handleCallback({ state, code: "provider-code" });
  const redirect = new URL(result.redirectUrl);
  assert.equal(redirect.searchParams.get("instagramOAuth"), "error");
  assert.equal(redirect.searchParams.get("errorCode"), "INSTAGRAM_OAUTH_IDENTITY_MISMATCH");
  assert.equal(redirect.searchParams.has("17841400000000001"), false);
  assert.equal(redirect.searchParams.has("17841400000000099"), false);
  assert.equal(activateCalls(), 0);
  assert.equal(credentials.some((row) => row.credentialStatus === "ACTIVE"), false);

  const replay = await service.handleCallback({ state, code: "provider-code" });
  assert.equal(new URL(replay.redirectUrl).searchParams.get("errorCode"), "INSTAGRAM_OAUTH_STATE_REPLAYED");
  const finalized = [...stateStore.values()][0];
  assert.notEqual(finalized?.status, "PENDING");
});

test("callback REAUTH_REQUIRED rejects account switch", async () => {
  setupEnv();
  const state = "reauth-switch-state";
  const { service, activateCalls, credentials } = buildService({
    stateStore: pendingStateStore(state),
    activeCredential: {
      id: "cred-reauth",
      tenantId: TENANT,
      channelConnectionId: CONNECTION,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      credentialStatus: "REAUTH_REQUIRED",
      providerInstagramAccountId: "17841400000000001",
      providerUserId: "17841400000000001",
      verifiedUsername: "brand.official",
      verifiedAccountType: "BUSINESS",
      identityVerifiedAt: new Date().toISOString(),
      tokenExpiresAt: new Date().toISOString(),
      refreshEligibleAt: new Date().toISOString(),
      lastRefreshAt: null,
      lastRefreshStatus: "NEVER",
      connectionHealthStatus: "DEGRADED",
      credentialVersion: 3,
      connectedAt: new Date().toISOString(),
      revokedAt: null,
      reauthRequiredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    providerClient: {
      buildAuthorizationUrl: () => "https://www.instagram.com/oauth/authorize",
      exchangeAuthorizationCode: async () => ({
        accessToken: "short-token",
        providerUserId: "17841400000000099",
        grantedScopes: ["instagram_business_basic"]
      }),
      exchangeForLongLivedAccessToken: async () => ({
        accessToken: "long-lived-token",
        providerUserId: "",
        expiresInSeconds: 5184000
      })
    },
    identityClient: {
      getOwnProfessionalAccount: async () => ({
        professionalAccountId: asInstagramProfessionalAccountId("17841400000000099"),
        username: asInstagramUsername("other.brand"),
        accountType: "BUSINESS"
      })
    }
  });

  const result = await service.handleCallback({ state, code: "provider-code" });
  const redirect = new URL(result.redirectUrl);
  assert.equal(redirect.searchParams.get("errorCode"), "INSTAGRAM_OAUTH_ACCOUNT_SWITCH_REJECTED");
  assert.equal(activateCalls(), 0);
  assert.equal(credentials.length, 0);
});

test("callback REAUTH_REQUIRED same account replaces token atomically", async () => {
  setupEnv();
  const state = "reauth-same-account-state";
  const { service, activateCalls, credentials } = buildService({
    stateStore: pendingStateStore(state),
    activeCredential: {
      id: "cred-reauth",
      tenantId: TENANT,
      channelConnectionId: CONNECTION,
      provider: "INSTAGRAM",
      authFamily: "INSTAGRAM_BUSINESS_LOGIN",
      credentialStatus: "REAUTH_REQUIRED",
      providerInstagramAccountId: "17841400000000001",
      providerUserId: "17841400000000001",
      verifiedUsername: "brand.official",
      verifiedAccountType: "BUSINESS",
      identityVerifiedAt: new Date().toISOString(),
      tokenExpiresAt: new Date().toISOString(),
      refreshEligibleAt: new Date().toISOString(),
      lastRefreshAt: null,
      lastRefreshStatus: "NEVER",
      connectionHealthStatus: "DEGRADED",
      credentialVersion: 3,
      connectedAt: new Date().toISOString(),
      revokedAt: null,
      reauthRequiredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });

  const result = await service.handleCallback({ state, code: "provider-code" });
  const redirect = new URL(result.redirectUrl);
  assert.equal(redirect.searchParams.get("instagramOAuth"), "connected");
  assert.equal(activateCalls(), 1);
  assert.equal(credentials.some((row) => row.credentialStatus === "ACTIVE"), true);
  assert.equal(credentials.some((row) => row.id === "cred-reauth"), true);
});

test("callback verifies identity only after token exchange and before activation", async () => {
  setupEnv();
  const state = "verification-order-state";
  const { service, callOrder } = buildService({ stateStore: pendingStateStore(state) });
  await service.handleCallback({ state, code: "provider-code" });
  assert.deepEqual(callOrder, [
    "exchangeAuthorizationCode",
    "exchangeForLongLivedAccessToken",
    "getOwnProfessionalAccount",
    "createPending",
    "activate"
  ]);
});
