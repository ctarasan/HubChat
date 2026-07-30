import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import type { OAuthTransactionRecord } from "../../domain/oauthTransactions.js";
import { runFacebookOperationalHealth } from "./facebookOAuthOperationalHealth.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const TEST_KEY = "d".repeat(64);

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

function accessTokenMeta(): ChannelCredentialMetadataDto {
  return {
    connectionId: CONNECTION_ID,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    credentialState: "SET",
    secretFingerprint: "fp",
    tokenExpiresAt: null,
    updatedAt: new Date().toISOString()
  };
}

function completedOAuthTransaction(
  overrides: Partial<OAuthTransactionRecord> = {}
): OAuthTransactionRecord {
  const now = new Date("2026-06-15T10:00:00.000Z");
  return {
    id: "tx-1",
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    provider: "FACEBOOK",
    stateHash: "state",
    resumeSessionHash: null,
    status: "COMPLETED",
    intent: "CONNECT",
    expectedPageId: null,
    initiatedByAuthUserId: "auth-1",
    initiatedBySalesAgentId: "agent-1",
    userTokenExpiresAt: null,
    pageCandidatesJson: [
      {
        pageId: "page-1",
        name: "Test Page",
        tasks: ["MESSAGING"],
        selectable: true,
        reasonCode: null,
        alreadyConnected: false
      }
    ],
    selectedPageId: "page-1",
    errorCategory: null,
    callbackReceivedAt: now,
    consumedAt: now,
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function graphFetchSuccess(appId = "test-facebook-app-id") {
  return async (url: string, init?: RequestInit) => {
    if (url.includes("fields=id,name,tasks")) {
      return new Response(
        JSON.stringify({
          error: {
            message: "(#100) Tried accessing nonexisting field (tasks)",
            code: 100
          }
        }),
        { status: 400 }
      );
    }
    if (url.includes("/subscribed_apps")) {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: appId,
              name: "HubChat Test",
              subscribed_fields: [
                "messages",
                "messaging_postbacks",
                "message_deliveries",
                "message_reads",
                "message_echoes",
                "feed"
              ]
            }
          ]
        }),
        { status: 200 }
      );
    }
    if (url.includes("fields=id,name&")) {
      return new Response(JSON.stringify({ id: "page-1", name: "Test Page" }), { status: 200 });
    }
    if (url.includes("fields=id&")) {
      return new Response(JSON.stringify({ id: "page-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "unexpected", code: 1 } }), { status: 400 });
  };
}

function buildRepos(transaction: OAuthTransactionRecord | null = completedOAuthTransaction()) {
  return {
    channelConnectionRepository: {
      listCredentialMetadataByConnection: async () => [accessTokenMeta()],
      retrieveDecryptedCredentialForRuntime: async () => ({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "FACEBOOK" as const,
        credentialType: "ACCESS_TOKEN" as const,
        plaintextSecret: "oauth-page-token"
      }),
      findByTenantAndProvider: async () => baseConnection()
    },
    channelSettingRepository: {
      getRuntimeConfigForConnectionTest: async () => null
    },
    oauthTransactionRepository: {
      findLatestCompletedForConnection: async () => transaction
    }
  };
}

function assertSixUniqueChecks(checks: { code: string }[]) {
  assert.equal(checks.length, 6);
  const codes = checks.map((check) => check.code);
  assert.deepEqual(codes, [
    "CREDENTIAL_RESOLUTION",
    "PAGE_ACCESS",
    "REQUIRED_TASKS",
    "GRAPH_API",
    "PAGE_WEBHOOK_SUBSCRIPTION",
    "RUNTIME_TEST_CONNECTION"
  ]);
}

test("operational health all PASS advances to READY / CONNECTED", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    now: () => new Date("2026-06-15T12:00:00.000Z"),
    env: process.env
  });

  assert.equal(result.connectionStatus, "READY");
  assert.equal(result.healthStatus, "OK");
  assert.equal(result.displayState, "CONNECTED");
  assert.equal(result.reconnectRequired, false);
  assertSixUniqueChecks(result.checks);
  assert.equal(result.checks.every((check) => check.status === "PASS"), true);
  assert.equal(JSON.stringify(result).includes("oauth-page-token"), false);
});

test("operational health page profile uses fields=id,name only on Graph v25", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const requestedUrls: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    requestedUrls.push(url);
    return graphFetchSuccess()(url, init);
  };

  await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch,
    env: process.env
  });

  const pageProfileUrl = requestedUrls.find(
    (url) => url.includes("/page-1") && url.includes("fields=id,name") && !url.includes("subscribed_apps")
  );
  assert.ok(pageProfileUrl);
  assert.match(pageProfileUrl!, /fields=id,name(?:&|$)/);
  assert.equal(pageProfileUrl!.includes("tasks"), false);
});

test("operational health verifies REQUIRED_TASKS from persisted OAuth page selection", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos(
    completedOAuthTransaction({
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
    })
  );
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    env: process.env
  });

  const requiredTasks = result.checks.find((check) => check.code === "REQUIRED_TASKS");
  assert.equal(requiredTasks?.status, "PASS");
});

test("operational health missing MESSAGING in persisted snapshot fails REQUIRED_TASKS", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos(
    completedOAuthTransaction({
      pageCandidatesJson: [
        {
          pageId: "page-1",
          name: "Test Page",
          tasks: [],
          selectable: false,
          reasonCode: "MISSING_PAGE_TASKS",
          alreadyConnected: false
        }
      ]
    })
  );
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    env: process.env
  });

  const requiredTasks = result.checks.find((check) => check.code === "REQUIRED_TASKS");
  assert.equal(requiredTasks?.status, "FAIL");
  assert.equal(result.displayState, "NEEDS_RECONNECT");
  assert.equal(result.reconnectRequired, true);
});

test("operational health returns exactly one RUNTIME_TEST_CONNECTION when PAGE_ACCESS would have failed on tasks field", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    env: process.env
  });

  const runtimeChecks = result.checks.filter((check) => check.code === "RUNTIME_TEST_CONNECTION");
  assert.equal(runtimeChecks.length, 1);
  assert.equal(runtimeChecks[0]?.status, "PASS");
  assertSixUniqueChecks(result.checks);
});

test("operational health resolver disabled blocks RUNTIME_TEST_CONNECTION", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "false";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: graphFetchSuccess() as typeof fetch,
    env: process.env
  });

  assert.equal(result.connectionStatus, "AUTHORIZING");
  assert.equal(result.displayState, "CONNECTING");
  assert.notEqual(result.healthStatus, "OK");
  const runtimeCheck = result.checks.find((check) => check.code === "RUNTIME_TEST_CONNECTION");
  assert.equal(runtimeCheck?.status, "FAIL");
  assertSixUniqueChecks(result.checks);
});

test("operational health revoked token maps to reconnect required", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  repos.channelConnectionRepository.listCredentialMetadataByConnection = async () => [
    { ...accessTokenMeta(), credentialState: "REVOKED" }
  ];

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    env: process.env
  });

  assert.equal(result.healthStatus, "RECONNECT_REQUIRED");
  assert.equal(result.displayState, "NEEDS_RECONNECT");
  assert.equal(result.reconnectRequired, true);
});

test("operational health page mismatch stays pre-READY", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url.includes("/subscribed_apps")) {
      return graphFetchSuccess()(url, init);
    }
    if (url.includes("fields=id,name&")) {
      return new Response(
        JSON.stringify({ id: "other-page", name: "Other" }),
        { status: 200 }
      );
    }
    if (url.includes("fields=id&")) {
      return new Response(JSON.stringify({ id: "other-page" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "other-page", name: "Other" }), { status: 200 });
  };

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch,
    env: process.env
  });

  assert.equal(result.connectionStatus, "AUTHORIZING");
  assert.equal(result.displayState, "CONNECTING");
  const pageAccess = result.checks.find((check) => check.code === "PAGE_ACCESS");
  assert.equal(pageAccess?.status, "FAIL");
  assertSixUniqueChecks(result.checks);
});

test("operational health messages+feed only does not become READY", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url.includes("/subscribed_apps")) {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "test-facebook-app-id",
              name: "HubChat Test",
              subscribed_fields: ["messages", "feed"]
            }
          ]
        }),
        { status: 200 }
      );
    }
    return graphFetchSuccess()(url, init);
  };

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection({ status: "READY", webhookActive: true }),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch,
    env: process.env
  });

  assert.notEqual(result.connectionStatus, "READY");
  assert.notEqual(result.healthStatus, "OK");
  const webhookCheck = result.checks.find((c) => c.code === "PAGE_WEBHOOK_SUBSCRIPTION");
  assert.equal(webhookCheck?.status, "FAIL");
  assert.match(webhookCheck?.message ?? "", /incomplete|subscribed/i);
});

test("operational health Graph GET subscription failure is actionable", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url.includes("/subscribed_apps") && init?.method !== "POST") {
      return new Response(JSON.stringify({ error: { message: "perm", code: 200 } }), { status: 403 });
    }
    return graphFetchSuccess()(url, init);
  };

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch,
    env: process.env
  });

  assert.notEqual(result.connectionStatus, "READY");
  const webhookCheck = result.checks.find((c) => c.code === "PAGE_WEBHOOK_SUBSCRIPTION");
  assert.equal(webhookCheck?.status, "FAIL");
});

test("operational health Graph POST subscription failure is actionable", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  process.env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED = "true";
  process.env.FACEBOOK_APP_ID = "test-facebook-app-id";
  const repos = buildRepos();
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url.includes("/subscribed_apps")) {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ success: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    return graphFetchSuccess()(url, init);
  };

  const { result } = await runFacebookOperationalHealth({
    tenantId: TENANT,
    connection: baseConnection(),
    channelConnectionRepository: repos.channelConnectionRepository as any,
    channelSettingRepository: repos.channelSettingRepository as any,
    oauthTransactionRepository: repos.oauthTransactionRepository as any,
    graphVersion: "v25.0",
    fetchFn: fetchFn as typeof fetch,
    env: process.env
  });

  assert.notEqual(result.connectionStatus, "READY");
  const webhookCheck = result.checks.find((c) => c.code === "PAGE_WEBHOOK_SUBSCRIPTION");
  assert.equal(webhookCheck?.status, "FAIL");
  assert.match(webhookCheck?.message ?? "", /subscription failed/i);
});