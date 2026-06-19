import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { createInstagramOAuthCallbackHandler } from "../../../app/api/channel-connect/instagram/oauth/callback/route.js";
import { createInstagramOAuthStartHandler } from "../../../app/api/channel-connect/instagram/oauth/start/route.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { InstagramOAuthStateRecord } from "../../domain/instagramOAuthStates.js";
import { hashInstagramOAuthState } from "../../lib/instagramOAuthSecurity.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const AGENT = "11111111-1111-4111-8111-111111111111";
const CONNECTION = "22222222-2222-4222-8222-222222222222";
const TEST_KEY = "d".repeat(64);

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

function setupOAuthEnv() {
  process.env.HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED = "true";
  process.env.META_APP_ID = "1234567890";
  process.env.FACEBOOK_APP_SECRET = "test-app-secret";
  process.env.NEXT_PUBLIC_APP_BASE_URL = "https://smartkorp-hub-chat.vercel.app";
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
}

function createBootstrap(overrides?: {
  connection?: ChannelConnectionRecord | null;
  stateStore?: Map<string, InstagramOAuthStateRecord>;
}) {
  const stateStore = overrides?.stateStore ?? new Map<string, InstagramOAuthStateRecord>();
  const credentials: Record<string, unknown>[] = [];

  return () =>
    ({
      supabase: {},
      channelConnectionRepository: {
        findById: async (tenantId: string, connectionId: string) => {
          if (tenantId !== TENANT || connectionId !== CONNECTION) return null;
          return overrides?.connection === null ? null : overrides?.connection ?? baseConnection();
        }
      },
      instagramOAuthStateRepository: {
        createState: async (input: {
          stateHash: string;
          tenantId: string;
          channelConnectionId: string;
          returnDestination: string;
          requestedScopes: string[];
          initiatedByAuthUserId: string;
          initiatedBySalesAgentId: string;
          expiresAt: Date;
        }) => {
          const record: InstagramOAuthStateRecord = {
            id: "state-1",
            tenantId: input.tenantId,
            channelConnectionId: input.channelConnectionId,
            provider: "INSTAGRAM",
            stateHash: input.stateHash,
            returnDestination: "CHANNEL_SETTINGS",
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
        claimStateAtCallback: async (input: { stateHash: string; now: Date }) => {
          const existing = stateStore.get(input.stateHash);
          if (!existing || existing.status !== "PENDING" || existing.expiresAt <= input.now) {
            throw new Error("state invalid");
          }
          const claimed = { ...existing, status: "CLAIMED" as const, claimedAt: input.now };
          stateStore.set(input.stateHash, claimed);
          return claimed;
        },
        finalizeState: async (input: { stateId: string; status: "CONSUMED" | "FAILED" }) => {
          const existing = [...stateStore.values()].find((row) => row.id === input.stateId);
          if (!existing) throw new Error("missing");
          const finalized = { ...existing, status: input.status, consumedAt: new Date() };
          stateStore.set(existing.stateHash, finalized);
          return finalized;
        }
      },
      instagramOAuthCredentialRepository: {
        findActiveByConnection: async () => null,
        createPending: async () => ({
          id: "cred-1",
          tenantId: TENANT,
          channelConnectionId: CONNECTION,
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
        }),
        activate: async () => ({
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
          connectionHealthStatus: "UNKNOWN",
          credentialVersion: 2,
          connectedAt: new Date().toISOString(),
          revokedAt: null,
          reauthRequiredAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    }) as never;
}

test("POST start rejects unauthenticated requests", async () => {
  setupOAuthEnv();
  const handler = createInstagramOAuthStartHandler({
    apiBootstrap: createBootstrap(),
    requireAuth: async () => {
      throw new Error("Unauthorized");
    }
  });
  const response = await handler(
    new NextRequest("http://localhost/api/channel-connect/instagram/oauth/start", { method: "POST" })
  );
  assert.equal(response.status, 401);
});

test("POST start rejects SALES and MANAGER", async () => {
  setupOAuthEnv();
  for (const role of ["SALES", "MANAGER"] as const) {
    const handler = createInstagramOAuthStartHandler({
      apiBootstrap: createBootstrap(),
      requireAuth: async () => {
        throw new Error("Forbidden");
      }
    });
    const response = await handler(
      new NextRequest("http://localhost/api/channel-connect/instagram/oauth/start", {
        method: "POST",
        headers: { authorization: "Bearer test", "content-type": "application/json" },
        body: JSON.stringify({ channelConnectionId: CONNECTION })
      })
    );
    assert.equal(response.status, 403, role);
  }
});

test("POST start ADMIN accepted with no-store headers", async () => {
  setupOAuthEnv();
  const handler = createInstagramOAuthStartHandler({
    apiBootstrap: createBootstrap(),
    requireAuth: async () => adminAuth
  });
  const response = await handler(
    new NextRequest("http://localhost/api/channel-connect/instagram/oauth/start", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ channelConnectionId: CONNECTION })
    })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const body = (await response.json()) as { data: { authorizationUrl: string; expiresAt: string } };
  assert.match(body.data.authorizationUrl, /^https:\/\/www\.instagram\.com\/oauth\/authorize/);
  assert.doesNotMatch(JSON.stringify(body), /client_secret|access_token|"state"/i);
});

test("POST start rejects arbitrary return URL fields", async () => {
  setupOAuthEnv();
  const handler = createInstagramOAuthStartHandler({
    apiBootstrap: createBootstrap(),
    requireAuth: async () => adminAuth
  });
  const response = await handler(
    new NextRequest("http://localhost/api/channel-connect/instagram/oauth/start", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        channelConnectionId: CONNECTION,
        redirectUrl: "https://evil.example"
      })
    })
  );
  assert.equal(response.status, 400);
});

test("POST start rejects when connect flag OFF", async () => {
  process.env.HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED = "false";
  process.env.META_APP_ID = "1234567890";
  process.env.FACEBOOK_APP_SECRET = "test-app-secret";
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const handler = createInstagramOAuthStartHandler({
    apiBootstrap: createBootstrap(),
    requireAuth: async () => adminAuth
  });
  const response = await handler(
    new NextRequest("http://localhost/api/channel-connect/instagram/oauth/start", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ channelConnectionId: CONNECTION })
    })
  );
  assert.equal(response.status, 503);
});

test("GET callback redirects with sanitized query and 303", async () => {
  setupOAuthEnv();
  const state = "route-callback-state";
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
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
  ]);

  const originalFetch = global.fetch;
  global.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.instagram.com/oauth/access_token")) {
      return new Response(
        JSON.stringify({ access_token: "short", user_id: "17841400000000001", permissions: [] }),
        { status: 200 }
      );
    }
    if (url.includes("graph.instagram.com") && url.includes("/me")) {
      return new Response(
        JSON.stringify({
          user_id: "17841400000000001",
          username: "brand.official",
          account_type: "BUSINESS"
        }),
        { status: 200 }
      );
    }
    if (url.includes("graph.instagram.com")) {
      return new Response(JSON.stringify({ access_token: "long", expires_in: 5184000 }), { status: 200 });
    }
    return originalFetch(input as string, init);
  };

  try {
    const handler = createInstagramOAuthCallbackHandler({
      apiBootstrap: createBootstrap({ stateStore })
    });
    const response = await handler(
      new NextRequest(
        `http://localhost/api/channel-connect/instagram/oauth/callback?code=provider-code&state=${state}`
      )
    );
    assert.equal(response.status, 303);
    const location = response.headers.get("location") ?? "";
    const redirect = new URL(location);
    assert.equal(redirect.searchParams.get("instagramOAuth"), "connected");
    assert.equal(redirect.searchParams.has("code"), false);
    assert.equal(redirect.searchParams.has("state"), false);
    assert.equal(redirect.pathname, "/dashboard/channel-settings");
  } finally {
    global.fetch = originalFetch;
  }
});

test("security regression: worker does not import instagram oauth connect service", () => {
  const worker = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../worker/main.ts"),
    "utf8"
  );
  assert.equal(worker.includes("instagramOAuthConnectService"), false);
  assert.equal(worker.includes("createInstagramOAuthConnectService"), false);
});
