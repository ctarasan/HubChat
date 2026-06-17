import test from "node:test";
import assert from "node:assert/strict";
import type {
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialState,
  ChannelCredentialType
} from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import {
  ChannelConnectRuntimeResolverError,
  resolveInboundChannelConnection,
  resolveOutboundChannelCredential
} from "./channelConnectRuntimeResolver.js";
import { toChannelConnectResolverLogPayload } from "../../lib/channelConnectRuntimeDiagnostics.js";
import {
  isChannelConnectResolverEnabled,
  parseChannelConnectRuntimeMode,
  parseChannelConnectRuntimeModeFromEnv,
  shouldAttemptChannelConnectDb
} from "../../lib/channelConnectRuntimeMode.js";

const TENANT = "tenant-ccp-2";
const CONNECTION_ID = "conn-1";
const PUBLIC_KEY = "ccp_test_public_key";

const baseConnection = (): ChannelConnectionRecord => ({
  id: CONNECTION_ID,
  tenantId: TENANT,
  provider: "LINE",
  status: "READY",
  providerAccountId: "line-bot-1",
  providerAccountName: "Test OA",
  providerPageId: null,
  providerIgAccountId: null,
  publicConnectionKey: PUBLIC_KEY,
  webhookEndpoint: "/api/webhook/line/connections/ccp_test_public_key",
  webhookActive: true,
  lastInboundVerifiedAt: null,
  lastOutboundVerifiedAt: null,
  lastHealthCheckAt: null,
  lastErrorCode: null,
  lastErrorMessageSafe: null,
  connectedBy: null,
  connectedAt: null,
  createdAt: new Date("2026-06-04T00:00:00.000Z"),
  updatedAt: new Date("2026-06-04T00:00:00.000Z")
});

const lineEnv = {
  LINE_CHANNEL_ACCESS_TOKEN: "env-line-access-token",
  LINE_CHANNEL_SECRET: "env-line-channel-secret",
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
};

const facebookEnv = {
  FACEBOOK_PAGE_ACCESS_TOKEN: "env-facebook-page-token",
  FACEBOOK_PAGE_ID: "page-env-1",
  META_GRAPH_VERSION: "v25.0",
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: lineEnv.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
};

const instagramEnv = {
  INSTAGRAM_ACCESS_TOKEN: "env-instagram-access-token",
  INSTAGRAM_PAGE_ID: "page-ig-env-1",
  INSTAGRAM_ACCOUNT_ID: "ig-biz-1",
  META_GRAPH_VERSION: "v25.0",
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: lineEnv.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
};

function credentialMetadata(
  provider: "LINE" | "FACEBOOK" | "INSTAGRAM",
  credentialType: ChannelCredentialType,
  state: ChannelCredentialState = "SET"
): ChannelCredentialMetadataDto {
  return {
    connectionId: CONNECTION_ID,
    provider,
    credentialType,
    credentialState: state,
    secretFingerprint: "fp_test",
    tokenExpiresAt: null,
    updatedAt: "2026-06-04T00:00:00.000Z"
  };
}

function decryptedSecret(
  provider: "LINE" | "FACEBOOK" | "INSTAGRAM",
  credentialType: ChannelCredentialType,
  plaintextSecret: string
): ChannelCredentialRuntimeSecret {
  return {
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    provider,
    credentialType,
    plaintextSecret,
    tokenExpiresAt: null
  };
}

type MockRepoOptions = {
  connection?: ChannelConnectionRecord | null;
  connections?: ChannelConnectionRecord[];
  metadata?: ChannelCredentialMetadataDto[];
  decryptMap?: Partial<Record<ChannelCredentialType, string | null>>;
  decryptThrows?: boolean;
};

function createMockRepository(options: MockRepoOptions = {}): ChannelConnectionRepository {
  const connections =
    options.connections ?? (options.connection ? [options.connection] : []);
  const connection = options.connection ?? connections[0] ?? null;
  const metadata = options.metadata ?? [];
  const decryptMap = options.decryptMap ?? {};
  const decryptThrows = options.decryptThrows ?? false;

  return {
    createConnection: async () => {
      throw new Error("not implemented");
    },
    listByTenant: async (tenantId) => (tenantId === TENANT ? connections : []),
    findById: async (tenantId, connectionId) =>
      tenantId === TENANT ? connections.find((row) => row.id === connectionId) ?? null : null,
    findByTenantAndProvider: async (tenantId, provider) =>
      tenantId === TENANT && connection?.provider === provider ? connection : null,
    findByTenantProviderAccount: async (input) =>
      input.tenantId === TENANT && connection?.providerAccountId === input.providerAccountId ? connection : null,
    findByPublicConnectionKey: async (key) => (key === PUBLIC_KEY ? connection : null),
    updateLifecycleStatus: async () => {
      throw new Error("not implemented");
    },
    updateProviderMetadata: async () => {
      throw new Error("not implemented");
    },
    updateWebhookStatus: async () => {
      throw new Error("not implemented");
    },
    updateHealthFields: async () => {
      throw new Error("not implemented");
    },
    findPublicConnectionSummary: async () => null,
    listCredentialMetadataByConnection: async () => metadata,
    storeEncryptedCredential: async () => {
      throw new Error("not implemented");
    },
    retrieveDecryptedCredentialForRuntime: async ({ credentialType }) => {
      if (decryptThrows) throw new Error("decrypt failed");
      const plaintext = decryptMap[credentialType];
      if (!plaintext) return null;
      return decryptedSecret(connection?.provider ?? "LINE", credentialType, plaintext);
    }
  };
}

test("parseChannelConnectRuntimeMode supports DB_WITH_ENV_FALLBACK, DB_ONLY, ENV_ONLY default", () => {
  assert.equal(parseChannelConnectRuntimeMode("LINE", "DB_WITH_ENV_FALLBACK"), "DB_WITH_ENV_FALLBACK");
  assert.equal(parseChannelConnectRuntimeMode("FACEBOOK", "DB_ONLY"), "DB_ONLY");
  assert.equal(parseChannelConnectRuntimeMode("INSTAGRAM", undefined), "ENV_ONLY");
  assert.equal(parseChannelConnectRuntimeMode("INSTAGRAM", "unknown-mode"), "ENV_ONLY");
});

test("parseChannelConnectRuntimeModeFromEnv reads provider-specific env vars", () => {
  const env = {
    HUBCHAT_LINE_RUNTIME_CONFIG_MODE: "DB_WITH_ENV_FALLBACK",
    HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE: "DB_ONLY",
    HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE: "ENV_ONLY"
  };
  assert.equal(parseChannelConnectRuntimeModeFromEnv("LINE", env), "DB_WITH_ENV_FALLBACK");
  assert.equal(parseChannelConnectRuntimeModeFromEnv("FACEBOOK", env), "DB_ONLY");
  assert.equal(parseChannelConnectRuntimeModeFromEnv("INSTAGRAM", env), "ENV_ONLY");
});

test("isChannelConnectResolverEnabled defaults false", () => {
  assert.equal(isChannelConnectResolverEnabled({}), false);
  assert.equal(isChannelConnectResolverEnabled({ HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED: "false" }), false);
  assert.equal(isChannelConnectResolverEnabled({ HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED: "true" }), true);
});

test("shouldAttemptChannelConnectDb respects resolver flag and mode", () => {
  assert.equal(shouldAttemptChannelConnectDb("DB_WITH_ENV_FALLBACK", false), false);
  assert.equal(shouldAttemptChannelConnectDb("ENV_ONLY", true), false);
  assert.equal(shouldAttemptChannelConnectDb("DB_WITH_ENV_FALLBACK", true), true);
  assert.equal(shouldAttemptChannelConnectDb("DB_ONLY", true), true);
});

test("outbound resolver disabled preserves legacy ENV_ONLY without DB reads", async () => {
  let dbReads = 0;
  const repository = createMockRepository({
    connection: baseConnection(),
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "db-line-access-token",
      CHANNEL_SECRET: "db-line-channel-secret"
    }
  });
  const originalFind = repository.findByTenantAndProvider.bind(repository);
  repository.findByTenantAndProvider = async (...args) => {
    dbReads += 1;
    return originalFind(...args);
  };

  const resolved = await resolveOutboundChannelCredential(
    { channelConnectionRepository: repository, env: lineEnv },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: false }
  );

  assert.equal(resolved.configSource, "ENV_ONLY");
  assert.equal(resolved.credentials.accessToken, "env-line-access-token");
  assert.equal(resolved.diagnostics.code, "resolver_disabled_legacy_env");
  assert.equal(dbReads, 0);
});

test("outbound LINE DB credential success when resolver enabled", async () => {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: baseConnection(),
        metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
        decryptMap: {
          ACCESS_TOKEN: "db-line-access-token",
          CHANNEL_SECRET: "db-line-channel-secret"
        }
      }),
      env: lineEnv
    },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );

  assert.equal(resolved.configSource, "DB");
  assert.equal(resolved.connectionId, CONNECTION_ID);
  assert.equal(resolved.credentials.accessToken, "db-line-access-token");
  assert.equal(resolved.credentials.channelSecret, "db-line-channel-secret");
  assert.equal(resolved.diagnostics.code, "db_credential_found");
});

test("outbound DB missing falls back to ENV in DB_WITH_ENV_FALLBACK", async () => {
  const resolved = await resolveOutboundChannelCredential(
    { channelConnectionRepository: createMockRepository({ connection: null }), env: lineEnv },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );

  assert.equal(resolved.configSource, "ENV_FALLBACK");
  assert.equal(resolved.credentials.accessToken, "env-line-access-token");
  assert.equal(resolved.diagnostics.code, "db_connection_missing");
});

test("outbound DB decrypt failure falls back to ENV in DB_WITH_ENV_FALLBACK", async () => {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: baseConnection(),
        metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
        decryptThrows: true
      }),
      env: lineEnv
    },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );

  assert.equal(resolved.configSource, "ENV_FALLBACK");
  assert.equal(resolved.diagnostics.code, "credential_decrypt_failed");
});

test("outbound DB decrypt failure fails safely in DB_ONLY", async () => {
  await assert.rejects(
    () =>
      resolveOutboundChannelCredential(
        {
          channelConnectionRepository: createMockRepository({
            connection: baseConnection(),
            metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
            decryptThrows: true
          }),
          env: lineEnv
        },
        { provider: "LINE", tenantId: TENANT, mode: "DB_ONLY", resolverEnabled: true }
      ),
    (err: ChannelConnectRuntimeResolverError) => {
      assert.equal(err.name, "ChannelConnectRuntimeResolverError");
      assert.equal(err.message.includes("db-line"), false);
      assert.equal(err.message.includes("env-line"), false);
      return true;
    }
  );
});

test("outbound missing encryption key falls back to ENV in DB_WITH_ENV_FALLBACK", async () => {
  const envWithoutKey = { ...lineEnv, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: undefined };
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: baseConnection(),
        metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")]
      }),
      env: envWithoutKey
    },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );

  assert.equal(resolved.configSource, "ENV_FALLBACK");
  assert.equal(resolved.diagnostics.code, "encryption_key_missing");
  assert.equal(resolved.credentials.accessToken, "env-line-access-token");
});

test("outbound missing encryption key fails safely in DB_ONLY", async () => {
  const envWithoutKey = { ...lineEnv, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: undefined };
  await assert.rejects(
    () =>
      resolveOutboundChannelCredential(
        {
          channelConnectionRepository: createMockRepository({
            connection: baseConnection(),
            metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")]
          }),
          env: envWithoutKey
        },
        { provider: "LINE", tenantId: TENANT, mode: "DB_ONLY", resolverEnabled: true }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "db_only_missing_config"
  );
});

test("outbound FACEBOOK OAuth-managed credential failure blocks env fallback", async () => {
  const facebookConnection: ChannelConnectionRecord = {
    ...baseConnection(),
    provider: "FACEBOOK",
    providerPageId: "page-oauth-1",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  await assert.rejects(
    () =>
      resolveOutboundChannelCredential(
        {
          channelConnectionRepository: createMockRepository({
            connection: facebookConnection,
            metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
            decryptThrows: true
          }),
          env: facebookEnv
        },
        {
          provider: "FACEBOOK",
          tenantId: TENANT,
          mode: "DB_WITH_ENV_FALLBACK",
          resolverEnabled: true,
          providerPageId: "page-oauth-1"
        }
      ),
    (err: ChannelConnectRuntimeResolverError) => {
      assert.equal(err.blockLegacyFallback, true);
      assert.equal(err.message.includes("env-facebook-page-token"), false);
      return true;
    }
  );
});

test("outbound FACEBOOK and INSTAGRAM DB credential success", async () => {
  const facebookConnection: ChannelConnectionRecord = {
    ...baseConnection(),
    provider: "FACEBOOK",
    providerAccountId: "page-db-1",
    providerPageId: "page-db-1"
  };
  const facebookResolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: facebookConnection,
        metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
        decryptMap: { ACCESS_TOKEN: "db-facebook-page-token" }
      }),
      env: facebookEnv
    },
    { provider: "FACEBOOK", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );
  assert.equal(facebookResolved.provider, "FACEBOOK");
  assert.equal(facebookResolved.configSource, "DB");
  assert.equal(facebookResolved.credentials.accessToken, "db-facebook-page-token");

  const instagramConnection: ChannelConnectionRecord = {
    ...baseConnection(),
    provider: "INSTAGRAM",
    providerPageId: "page-ig-db-1",
    providerIgAccountId: "ig-biz-db-1"
  };
  const instagramResolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: instagramConnection,
        metadata: [credentialMetadata("INSTAGRAM", "ACCESS_TOKEN")],
        decryptMap: { ACCESS_TOKEN: "db-instagram-access-token" }
      }),
      env: instagramEnv
    },
    { provider: "INSTAGRAM", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );
  assert.equal(instagramResolved.provider, "INSTAGRAM");
  assert.equal(instagramResolved.configSource, "DB");
  assert.equal(instagramResolved.credentials.accessToken, "db-instagram-access-token");
});

test("sanitized diagnostics and errors do not leak token-like strings", async () => {
  const logPayloads: Record<string, unknown>[] = [];
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: baseConnection(),
        metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
        decryptMap: {
          ACCESS_TOKEN: "db-line-access-token",
          CHANNEL_SECRET: "db-line-channel-secret"
        }
      }),
      env: lineEnv,
      log: (payload) => logPayloads.push(payload)
    },
    { provider: "LINE", tenantId: TENANT, mode: "DB_WITH_ENV_FALLBACK", resolverEnabled: true }
  );

  const serialized = JSON.stringify({ diagnostics: resolved.diagnostics, logs: logPayloads, message: resolved.diagnostics.fallbackReason });
  assert.equal(serialized.includes("db-line-access-token"), false);
  assert.equal(serialized.includes("db-line-channel-secret"), false);
  assert.equal(serialized.includes("env-line-access-token"), false);
  toChannelConnectResolverLogPayload(resolved.diagnostics);
});

test("inbound lookup by public_connection_key succeeds for LINE", async () => {
  const resolved = await resolveInboundChannelConnection(
    {
      channelConnectionRepository: createMockRepository({
        connection: baseConnection(),
        metadata: [credentialMetadata("LINE", "CHANNEL_SECRET")],
        decryptMap: { CHANNEL_SECRET: "db-line-channel-secret" }
      }),
      env: lineEnv
    },
    { provider: "LINE", publicConnectionKey: PUBLIC_KEY }
  );

  assert.equal(resolved.connectionId, CONNECTION_ID);
  assert.equal(resolved.verificationMaterial.channelSecret, "db-line-channel-secret");
  assert.equal(resolved.diagnostics.code, "db_credential_found");
});

test("inbound missing connection fails safely", async () => {
  await assert.rejects(
    () =>
      resolveInboundChannelConnection(
        { channelConnectionRepository: createMockRepository({ connection: null }), env: lineEnv },
        { provider: "LINE", publicConnectionKey: "ccp_missing" }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "db_connection_missing"
  );
});

test("inbound revoked connection fails safely", async () => {
  await assert.rejects(
    () =>
      resolveInboundChannelConnection(
        {
          channelConnectionRepository: createMockRepository({
            connection: { ...baseConnection(), status: "REVOKED" },
            metadata: [credentialMetadata("LINE", "CHANNEL_SECRET")],
            decryptMap: { CHANNEL_SECRET: "db-line-channel-secret" }
          }),
          env: lineEnv
        },
        { provider: "LINE", publicConnectionKey: PUBLIC_KEY }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "connection_status_invalid"
  );
});

test("inbound provider mismatch fails safely", async () => {
  await assert.rejects(
    () =>
      resolveInboundChannelConnection(
        {
          channelConnectionRepository: createMockRepository({ connection: baseConnection() }),
          env: lineEnv
        },
        { provider: "FACEBOOK", publicConnectionKey: PUBLIC_KEY, expectedProvider: "FACEBOOK" }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "provider_account_mismatch"
  );
});

test("inbound FACEBOOK uses APP_SECRET verification material", async () => {
  const facebookConnection: ChannelConnectionRecord = {
    ...baseConnection(),
    provider: "FACEBOOK",
    providerPageId: "page-db-1"
  };
  const resolved = await resolveInboundChannelConnection(
    {
      channelConnectionRepository: createMockRepository({
        connection: facebookConnection,
        metadata: [credentialMetadata("FACEBOOK", "APP_SECRET")],
        decryptMap: { APP_SECRET: "db-facebook-app-secret" }
      }),
      env: facebookEnv
    },
    { provider: "FACEBOOK", publicConnectionKey: PUBLIC_KEY }
  );
  assert.equal(resolved.verificationMaterial.appSecret, "db-facebook-app-secret");
});

test("inbound missing encryption key fails safely", async () => {
  const envWithoutKey = { ...lineEnv, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: undefined };
  await assert.rejects(
    () =>
      resolveInboundChannelConnection(
        {
          channelConnectionRepository: createMockRepository({
            connection: baseConnection(),
            metadata: [credentialMetadata("LINE", "CHANNEL_SECRET")]
          }),
          env: envWithoutKey
        },
        { provider: "LINE", publicConnectionKey: PUBLIC_KEY }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "encryption_key_missing"
  );
});

function facebookOAuthConnection(id: string, pageId: string, status: ChannelConnectionRecord["status"] = "READY") {
  return {
    ...baseConnection(),
    id,
    provider: "FACEBOOK" as const,
    status,
    providerPageId: pageId,
    providerAccountId: pageId,
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
}

test("outbound FACEBOOK resolves unique READY Page match when channel_connection_id is null", async () => {
  const oauthReady = facebookOAuthConnection("conn-oauth-ready", "541846535686129");
  const legacyReady = facebookOAuthConnection("conn-legacy-ready", "1137356672785125");
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connections: [legacyReady, oauthReady],
        metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
        decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
      }),
      env: facebookEnv
    },
    {
      provider: "FACEBOOK",
      tenantId: TENANT,
      mode: "DB_WITH_ENV_FALLBACK",
      resolverEnabled: true,
      providerPageId: "541846535686129"
    }
  );

  assert.equal(resolved.configSource, "DB");
  assert.equal(resolved.connectionId, "conn-oauth-ready");
  assert.equal(resolved.credentials.accessToken, "oauth-page-token");
});

test("outbound FACEBOOK fails closed when no READY Page match", async () => {
  await assert.rejects(
    () =>
      resolveOutboundChannelCredential(
        {
          channelConnectionRepository: createMockRepository({
            connections: [facebookOAuthConnection("conn-oauth-ready", "541846535686129")],
            metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
            decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
          }),
          env: facebookEnv
        },
        {
          provider: "FACEBOOK",
          tenantId: TENANT,
          mode: "DB_ONLY",
          resolverEnabled: true,
          providerPageId: "1137356672785125"
        }
      ),
    (err: ChannelConnectRuntimeResolverError) => {
      assert.equal(err.blockLegacyFallback, true);
      assert.equal(err.message.includes("env-facebook-page-token"), false);
      return true;
    }
  );
});

test("outbound FACEBOOK fails closed when multiple READY connections share the same Page", async () => {
  await assert.rejects(
    () =>
      resolveOutboundChannelCredential(
        {
          channelConnectionRepository: createMockRepository({
            connections: [
              facebookOAuthConnection("conn-a", "541846535686129"),
              facebookOAuthConnection("conn-b", "541846535686129")
            ],
            metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
            decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
          }),
          env: facebookEnv
        },
        {
          provider: "FACEBOOK",
          tenantId: TENANT,
          mode: "DB_ONLY",
          resolverEnabled: true,
          providerPageId: "541846535686129"
        }
      ),
    (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "ambiguous_channel_connection"
  );
});

test("outbound FACEBOOK explicit channel_connection_id remains authoritative", async () => {
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connections: [
          facebookOAuthConnection("conn-a", "541846535686129"),
          facebookOAuthConnection("conn-b", "1137356672785125")
        ],
        metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
        decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
      }),
      env: facebookEnv
    },
    {
      provider: "FACEBOOK",
      tenantId: TENANT,
      mode: "DB_WITH_ENV_FALLBACK",
      resolverEnabled: true,
      channelConnectionId: "conn-b",
      providerPageId: "541846535686129"
    }
  );

  assert.equal(resolved.connectionId, "conn-b");
});

function captureResolverLogs(
  run: (logs: Record<string, unknown>[]) => Promise<void>
): Promise<Record<string, unknown>[]> {
  const logs: Record<string, unknown>[] = [];
  return run(logs).then(() => logs);
}

async function expectOAuthDiagnosticLog(input: {
  logs: Record<string, unknown>[];
  diagnosticCode: string;
  encryptionKeyConfigured?: boolean;
  explicitChannelConnectionIdSupplied?: boolean;
}) {
  const match = input.logs.find(
    (entry) =>
      entry.event === "facebook_oauth_outbound_credential_failure" &&
      entry.diagnosticCode === input.diagnosticCode
  );
  assert.ok(match, `expected facebook_oauth_outbound_credential_failure log for ${input.diagnosticCode}`);
  assert.equal(match!.provider, "FACEBOOK");
  assert.equal(match!.blockLegacyFallback, true);
  assert.equal(JSON.stringify(match).includes("EAAG"), false);
  assert.equal(JSON.stringify(match).includes(facebookEnv.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY), false);
  if (input.encryptionKeyConfigured !== undefined) {
    assert.equal(match!.encryptionKeyConfigured, input.encryptionKeyConfigured);
  }
  if (input.explicitChannelConnectionIdSupplied !== undefined) {
    assert.equal(match!.explicitChannelConnectionIdSupplied, input.explicitChannelConnectionIdSupplied);
  }
}

test("outbound FACEBOOK OAuth-managed encryption_key_missing emits safe diagnostic before throw", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-key", "541846535686129");
  const logs = await captureResolverLogs(async (captured) => {
    await assert.rejects(
      () =>
        resolveOutboundChannelCredential(
          {
            channelConnectionRepository: createMockRepository({
              connection: facebookConnection,
              metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
              decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
            }),
            env: { ...facebookEnv, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: undefined },
            log: (payload) => captured.push(payload)
          },
          {
            provider: "FACEBOOK",
            tenantId: TENANT,
            mode: "DB_WITH_ENV_FALLBACK",
            resolverEnabled: true,
            channelConnectionId: "conn-oauth-key",
            providerPageId: "541846535686129"
          }
        ),
      (err: ChannelConnectRuntimeResolverError) => {
        assert.equal(err.blockLegacyFallback, true);
        assert.equal(err.diagnosticCode, "encryption_key_missing");
        return true;
      }
    );
  });
  await expectOAuthDiagnosticLog({
    logs,
    diagnosticCode: "encryption_key_missing",
    encryptionKeyConfigured: false,
    explicitChannelConnectionIdSupplied: true
  });
});

test("outbound FACEBOOK OAuth-managed credential_decrypt_failed emits safe diagnostic", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-decrypt", "541846535686129");
  const logs = await captureResolverLogs(async (captured) => {
    await assert.rejects(
      () =>
        resolveOutboundChannelCredential(
          {
            channelConnectionRepository: createMockRepository({
              connection: facebookConnection,
              metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
              decryptThrows: true
            }),
            env: facebookEnv,
            log: (payload) => captured.push(payload)
          },
          {
            provider: "FACEBOOK",
            tenantId: TENANT,
            mode: "DB_WITH_ENV_FALLBACK",
            resolverEnabled: true,
            providerPageId: "541846535686129"
          }
        ),
      (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "credential_decrypt_failed"
    );
  });
  await expectOAuthDiagnosticLog({ logs, diagnosticCode: "credential_decrypt_failed", encryptionKeyConfigured: true });
});

test("outbound FACEBOOK OAuth-managed credential_state_invalid emits safe diagnostic", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-state", "541846535686129");
  const logs = await captureResolverLogs(async (captured) => {
    await assert.rejects(
      () =>
        resolveOutboundChannelCredential(
          {
            channelConnectionRepository: createMockRepository({
              connection: facebookConnection,
              metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN", "REVOKED")]
            }),
            env: facebookEnv,
            log: (payload) => captured.push(payload)
          },
          {
            provider: "FACEBOOK",
            tenantId: TENANT,
            mode: "DB_WITH_ENV_FALLBACK",
            resolverEnabled: true,
            providerPageId: "541846535686129"
          }
        ),
      (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "credential_state_invalid"
    );
  });
  await expectOAuthDiagnosticLog({ logs, diagnosticCode: "credential_state_invalid", encryptionKeyConfigured: true });
});

test("outbound FACEBOOK OAuth-managed db_credential_missing emits safe diagnostic when page match is absent", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-missing", "541846535686129");
  const logs = await captureResolverLogs(async (captured) => {
    await assert.rejects(
      () =>
        resolveOutboundChannelCredential(
          {
            channelConnectionRepository: createMockRepository({
              connection: facebookConnection,
              metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
              decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
            }),
            env: facebookEnv,
            log: (payload) => captured.push(payload)
          },
          {
            provider: "FACEBOOK",
            tenantId: TENANT,
            mode: "DB_WITH_ENV_FALLBACK",
            resolverEnabled: true,
            providerPageId: "1137356672785125"
          }
        ),
      (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "db_credential_missing"
    );
  });
  await expectOAuthDiagnosticLog({ logs, diagnosticCode: "db_credential_missing", encryptionKeyConfigured: true });
});

test("outbound FACEBOOK OAuth-managed credential_decrypt_failed emits stderr diagnostic without deps.log", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-stderr", "541846535686129");
  const stderrLines: string[] = [];
  const original = console.error;
  console.error = (message?: unknown) => {
    stderrLines.push(String(message));
  };
  try {
    await assert.rejects(
      () =>
        resolveOutboundChannelCredential(
          {
            channelConnectionRepository: createMockRepository({
              connection: facebookConnection,
              metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
              decryptThrows: true
            }),
            env: facebookEnv
          },
          {
            provider: "FACEBOOK",
            tenantId: TENANT,
            mode: "DB_WITH_ENV_FALLBACK",
            resolverEnabled: true,
            channelConnectionId: "conn-oauth-stderr",
            providerPageId: "541846535686129"
          }
        ),
      (err: ChannelConnectRuntimeResolverError) => err.diagnosticCode === "credential_decrypt_failed"
    );
  } finally {
    console.error = original;
  }
  const events = stderrLines.map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(
    events.filter((entry) => entry.event === "facebook_oauth_outbound_credential_failure").length,
    1
  );
});

test("outbound FACEBOOK OAuth-managed success does not emit failure diagnostic", async () => {
  const facebookConnection = facebookOAuthConnection("conn-oauth-ok", "541846535686129");
  const logs: Record<string, unknown>[] = [];
  const resolved = await resolveOutboundChannelCredential(
    {
      channelConnectionRepository: createMockRepository({
        connection: facebookConnection,
        metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
        decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
      }),
      env: facebookEnv,
      log: (payload) => logs.push(payload)
    },
    {
      provider: "FACEBOOK",
      tenantId: TENANT,
      mode: "DB_WITH_ENV_FALLBACK",
      resolverEnabled: true,
      providerPageId: "541846535686129"
    }
  );
  assert.equal(resolved.configSource, "DB");
  assert.equal(
    logs.some((entry) => entry.event === "facebook_oauth_outbound_credential_failure"),
    false
  );
});
