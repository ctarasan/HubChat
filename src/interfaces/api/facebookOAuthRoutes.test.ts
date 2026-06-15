import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createFacebookOAuthCallbackHandler } from "../../../app/api/channel-connect/facebook/oauth/callback/route.js";
import { createFacebookOAuthCompleteHandler } from "../../../app/api/channel-connect/facebook/complete/route.js";
import { createFacebookOAuthStatusHandler } from "../../../app/api/channel-connect/facebook/status/route.js";
import { createFacebookOAuthHealthHandler } from "../../../app/api/channel-connect/facebook/health/route.js";
import { createFacebookOAuthStartHandler } from "../../../app/api/channel-connect/facebook/oauth/start/route.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { OAuthTransactionRecord } from "../../domain/oauthTransactions.js";

const TENANT_A = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";

const adminAuth = {
  tenantId: TENANT_A,
  role: "ADMIN" as const,
  userId: "auth-user-1",
  email: "admin@test.com",
  salesAgentId: AGENT_ID
};

const TEST_KEY = "b".repeat(64);

function baseConnection(overrides: Partial<ChannelConnectionRecord> = {}): ChannelConnectionRecord {
  const now = new Date("2026-06-15T10:00:00.000Z");
  return {
    id: CONNECTION_ID,
    tenantId: TENANT_A,
    provider: "FACEBOOK",
    status: "AUTHORIZING",
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
    connectedBy: AGENT_ID,
    connectedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function setupOAuthEnv() {
  process.env.HUBCHAT_FACEBOOK_OAUTH_ENABLED = "true";
  process.env.META_APP_ID = "1234567890";
  process.env.FACEBOOK_APP_SECRET = "test-app-secret";
  process.env.NEXT_PUBLIC_APP_BASE_URL = "https://smartkorp-hub-chat.vercel.app";
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.META_GRAPH_VERSION = "v25.0";
}

test("GET /status rejects MANAGER", async () => {
  const handler = createFacebookOAuthStatusHandler({
    requireAuth: async () => {
      throw new Error("Forbidden");
    },
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(
    new NextRequest("http://local/api/channel-connect/facebook/status", {
      headers: { Authorization: "Bearer t", "x-tenant-id": TENANT_A }
    })
  );
  assert.equal(res.status, 403);
});

test("GET /status returns oauthAvailable without secrets", async () => {
  setupOAuthEnv();
  const handler = createFacebookOAuthStatusHandler({
    requireAuth: async () => adminAuth,
    apiBootstrap: () =>
      ({
        channelConnectionRepository: {
          findByTenantAndProvider: async () => null,
          listCredentialMetadataByConnection: async () => []
        },
        oauthTransactionRepository: {},
        channelSettingRepository: {
          findByTenantAndChannel: async () => ({ configured: false })
        }
      }) as any
  });
  const res = await handler(
    new NextRequest("http://local/api/channel-connect/facebook/status", {
      headers: { Authorization: "Bearer t", "x-tenant-id": TENANT_A }
    })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { oauthAvailable: boolean; displayState: string } };
  assert.equal(body.data.oauthAvailable, true);
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("POST /oauth/start returns authorizeUrl without transactionId", async () => {
  setupOAuthEnv();
  const handler = createFacebookOAuthStartHandler({
    requireAuth: async () => adminAuth,
    apiBootstrap: () =>
      ({
        channelConnectionRepository: {
          findByTenantAndProvider: async () => null,
          createConnection: async () => baseConnection({ status: "DRAFT" }),
          updateLifecycleStatus: async () => baseConnection({ status: "AUTHORIZING" })
        },
        oauthTransactionRepository: {
          createTransaction: async () =>
            ({
              id: "tx-1",
              tenantId: TENANT_A,
              connectionId: CONNECTION_ID,
              status: "PENDING"
            }) as OAuthTransactionRecord
        },
        channelSettingRepository: {
          findByTenantAndChannel: async () => null
        }
      }) as any
  });
  const res = await handler(
    new NextRequest("http://local/api/channel-connect/facebook/oauth/start", {
      method: "POST",
      headers: {
        Authorization: "Bearer t",
        "x-tenant-id": TENANT_A,
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { authorizeUrl: string; expiresAt: string } };
  assert.match(body.data.authorizeUrl, /facebook\.com\/v25\.0\/dialog\/oauth/);
  assert.equal(body.data.authorizeUrl.includes("state="), true);
  assert.equal(JSON.stringify(body).includes("transactionId"), false);
});

test("GET /oauth/callback error redirect sanitizes provider error", async () => {
  setupOAuthEnv();
  const handler = createFacebookOAuthCallbackHandler({
    apiBootstrap: () => ({}) as any
  });
  const res = await handler(
    new NextRequest(
      "http://local/api/channel-connect/facebook/oauth/callback?error=access_denied&error_reason=user_denied"
    )
  );
  assert.equal(res.status, 302);
  const location = res.headers.get("location") ?? "";
  assert.match(location, /oauth=error/);
  assert.match(location, /errorCategory=ACCESS_DENIED/);
  assert.equal(location.includes("code="), false);
  assert.equal(location.includes("state="), false);
  assert.equal(location.includes("access_denied"), false);
});

test("POST /complete returns CONNECTING and never READY", async () => {
  setupOAuthEnv();
  const stored: { plaintext?: string } = {};
  const handler = createFacebookOAuthCompleteHandler({
    requireAuth: async () => adminAuth,
    apiBootstrap: () =>
      ({
        channelConnectionRepository: {
          findById: async () => baseConnection({ status: "AUTHORIZING" }),
          updateLifecycleStatus: async () => baseConnection({ status: "AUTHORIZING" }),
          updateProviderMetadata: async () => baseConnection({ status: "AUTHORIZING" }),
          storeEncryptedCredential: async (input: { plaintextSecret: string }) => {
            stored.plaintext = input.plaintextSecret;
            return {
              credentialType: "ACCESS_TOKEN",
              credentialState: "SET"
            };
          },
          listCredentialMetadataByConnection: async () => []
        },
        oauthTransactionRepository: {
          findActiveByResumeSessionHash: async () =>
            ({
              id: "tx-1",
              tenantId: TENANT_A,
              connectionId: CONNECTION_ID,
              status: "PAGES_READY",
              initiatedByAuthUserId: adminAuth.userId,
              initiatedBySalesAgentId: AGENT_ID,
              expiresAt: new Date("2026-06-15T11:00:00.000Z"),
              pageCandidatesJson: [
                {
                  pageId: "page-1",
                  name: "Test Page",
                  tasks: ["MESSAGING"],
                  selectable: true,
                  reasonCode: null,
                  alreadyConnected: false
                }
              ]
            }) as OAuthTransactionRecord,
          getDecryptedUserToken: async () => "user-token-placeholder",
          updateTransaction: async () =>
            ({
              id: "tx-1",
              status: "COMPLETED"
            }) as OAuthTransactionRecord
        },
        channelSettingRepository: {
          findByTenantAndChannel: async () => ({ configured: true }),
          upsertForTenant: async () => {
            throw new Error("must not write channel_settings in OAuth complete");
          }
        }
      }) as any
  });

  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/me/accounts")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "page-1",
              name: "Test Page",
              tasks: ["MESSAGING"],
              access_token: "short-page-token-placeholder"
            }
          ]
        }),
        { status: 200 }
      );
    }
    if (url.includes("/oauth/access_token")) {
      return new Response(
        JSON.stringify({ access_token: "long-page-token-placeholder", expires_in: 3600 }),
        { status: 200 }
      );
    }
    return new Response("{}", { status: 404 });
  };

  try {
    const res = await handler(
      new NextRequest("http://local/api/channel-connect/facebook/complete", {
        method: "POST",
        headers: {
          Authorization: "Bearer t",
          "x-tenant-id": TENANT_A,
          "content-type": "application/json",
          cookie: "hubchat_fb_oauth_session=resume-value"
        },
        body: JSON.stringify({ pageId: "page-1" })
      })
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: {
        connectionStatus: string;
        displayState: string;
        healthStatus: string;
        oauthStage: string;
      };
    };
    assert.equal(body.data.connectionStatus, "AUTHORIZING");
    assert.equal(body.data.displayState, "CONNECTING");
    assert.equal(body.data.healthStatus, "UNKNOWN");
    assert.equal(body.data.oauthStage, "COMPLETED");
    assert.equal(JSON.stringify(body).includes("long-page-token"), false);
    assert.equal(stored.plaintext, "long-page-token-placeholder");
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /health returns deferred CONNECTING response without READY", async () => {
  setupOAuthEnv();
  const handler = createFacebookOAuthHealthHandler({
    requireAuth: async () => adminAuth,
    apiBootstrap: () =>
      ({
        channelConnectionRepository: {
          findByTenantAndProvider: async () => baseConnection({ status: "AUTHORIZING" })
        },
        oauthTransactionRepository: {},
        channelSettingRepository: {}
      }) as any
  });
  const res = await handler(
    new NextRequest("http://local/api/channel-connect/facebook/health", {
      method: "POST",
      headers: { Authorization: "Bearer t", "x-tenant-id": TENANT_A }
    })
  );
  assert.equal(res.status, 501);
  const body = (await res.json()) as { data: { displayState: string; connectionStatus: string } };
  assert.equal(body.data.displayState, "CONNECTING");
  assert.notEqual(body.data.connectionStatus, "READY");
});
