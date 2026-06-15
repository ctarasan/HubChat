import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType
} from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";
import { createLineOutboundAdapterResolver } from "../lineOutbound/createLineOutboundAdapterResolver.js";
import { createFacebookOutboundAdapterResolver } from "../facebookOutbound/createFacebookOutboundAdapterResolver.js";
import { createInstagramOutboundAdapterResolver } from "../instagramOutbound/createInstagramOutboundAdapterResolver.js";
import {
  resolveFacebookWorkerOutboundConfig,
  resolveInstagramWorkerOutboundConfig,
  resolveLineWorkerOutboundConfig
} from "./resolveWorkerOutboundWithChannelConnect.js";
import { ChannelConnectRuntimeResolverError } from "./channelConnectRuntimeResolver.js";

const TENANT = "tenant-ccp-3";

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
  INSTAGRAM_ACCOUNT_ID: "ig-biz-env-1",
  META_GRAPH_VERSION: "v25.0",
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: lineEnv.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY
};

const legacyLineRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT,
  channel: "LINE",
  enabled: true,
  providerPageId: null,
  providerAccountName: null,
  secrets: { accessToken: "legacy-line-token", channelSecret: "legacy-line-secret" }
};

const legacyFacebookRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT,
  channel: "FACEBOOK",
  enabled: true,
  providerPageId: "legacy-page-1",
  providerAccountName: null,
  secrets: { accessToken: "legacy-facebook-token" }
};

const legacyInstagramRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT,
  channel: "INSTAGRAM",
  enabled: true,
  providerPageId: "legacy-ig-page-1",
  providerAccountName: null,
  secrets: { accessToken: "legacy-instagram-token" }
};

function legacyChannelSettingRepository(
  runtime: ChannelRuntimeConfig | null
): ChannelSettingRepository {
  return {
    getRuntimeConfig: async () => runtime,
    findByTenantAndChannel: async () => null,
    listByTenant: async () => [],
    upsertForTenant: async () => {
      throw new Error("not implemented");
    },
    getRuntimeConfigForConnectionTest: async () => runtime
  } as unknown as ChannelSettingRepository;
}

function baseLineConnection(): ChannelConnectionRecord {
  return {
    id: "conn-line-1",
    tenantId: TENANT,
    provider: "LINE",
    status: "READY",
    providerAccountId: "line-bot-1",
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_line_key",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z")
  };
}

function credentialMetadata(
  provider: "LINE" | "FACEBOOK" | "INSTAGRAM",
  credentialType: ChannelCredentialType
): ChannelCredentialMetadataDto {
  return {
    connectionId: "conn-line-1",
    provider,
    credentialType,
    credentialState: "SET",
    secretFingerprint: "fp_test",
    tokenExpiresAt: null,
    updatedAt: "2026-06-04T00:00:00.000Z"
  };
}

function createTrackingChannelConnectionRepository(
  connection: ChannelConnectionRecord | null,
  options: {
    metadata?: ChannelCredentialMetadataDto[];
    decryptMap?: Partial<Record<ChannelCredentialType, string>>;
    decryptThrows?: boolean;
  } = {}
): { repository: ChannelConnectionRepository; callCounts: { findByTenantAndProvider: number } } {
  const callCounts = { findByTenantAndProvider: 0 };
  const metadata = options.metadata ?? [];
  const decryptMap = options.decryptMap ?? {};
  const decryptThrows = options.decryptThrows ?? false;

  const repository: ChannelConnectionRepository = {
    createConnection: async () => {
      throw new Error("not implemented");
    },
    listByTenant: async () => (connection ? [connection] : []),
    findById: async () => connection,
    findByTenantAndProvider: async () => {
      callCounts.findByTenantAndProvider += 1;
      return connection;
    },
    findByTenantProviderAccount: async () => connection,
    findByPublicConnectionKey: async () => connection,
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
      return {
        tenantId: TENANT,
        connectionId: connection?.id ?? "conn-line-1",
        provider: connection?.provider ?? "LINE",
        credentialType,
        plaintextSecret: plaintext,
        tokenExpiresAt: null
      } satisfies ChannelCredentialRuntimeSecret;
    }
  };

  return { repository, callCounts };
}

test("flag off does not read channel_connections and uses legacy channel_settings", async () => {
  const { repository, callCounts } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "ccp-line-token",
      CHANNEL_SECRET: "ccp-line-secret"
    }
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: false
  });

  assert.equal(callCounts.findByTenantAndProvider, 0);
  assert.equal(resolved.credentials.channelAccessToken, "legacy-line-token");
});

test("ENV_ONLY with flag on still uses legacy config only", async () => {
  const { repository, callCounts } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "ccp-line-token",
      CHANNEL_SECRET: "ccp-line-secret"
    }
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "ENV_ONLY",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(null),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(callCounts.findByTenantAndProvider, 0);
  assert.equal(resolved.source, "env");
  assert.equal(resolved.credentials.channelAccessToken, "env-line-access-token");
});

test("LINE DB_WITH_ENV_FALLBACK uses channel_connect DB credential when flag on", async () => {
  const { repository } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "ccp-line-token",
      CHANNEL_SECRET: "ccp-line-secret"
    }
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.channelAccessToken, "ccp-line-token");
  assert.equal(resolved.credentials.channelSecret, "ccp-line-secret");
});

test("LINE DB missing falls back to legacy channel_settings", async () => {
  const { repository } = createTrackingChannelConnectionRepository(null);

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.channelAccessToken, "legacy-line-token");
});

test("LINE decrypt failure falls back to legacy channel_settings", async () => {
  const { repository } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptThrows: true
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.channelAccessToken, "legacy-line-token");
});

test("LINE missing encryption key falls back to legacy channel_settings", async () => {
  const envWithoutKey = { ...lineEnv, HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: undefined };
  const { repository } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")]
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: envWithoutKey,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.channelAccessToken, "legacy-line-token");
});

test("LINE DB_ONLY fails safely without ENV or legacy token leakage", async () => {
  const { repository } = createTrackingChannelConnectionRepository(null);

  await assert.rejects(
    () =>
      resolveLineWorkerOutboundConfig({
        mode: "DB_ONLY",
        tenantId: TENANT,
        env: lineEnv,
        channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
        channelConnectionRepository: repository,
        resolverEnabled: true
      }),
    (err: ChannelConnectRuntimeResolverError) => {
      assert.equal(err.message.includes("ccp-line-token"), false);
      assert.equal(err.message.includes("legacy-line-token"), false);
      assert.equal(err.message.includes("env-line-access-token"), false);
      return true;
    }
  );
});

test("LINE DB_ONLY uses channel_connect credential on success", async () => {
  const { repository } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "ccp-line-only-token",
      CHANNEL_SECRET: "ccp-line-only-secret"
    }
  });

  const resolved = await resolveLineWorkerOutboundConfig({
    mode: "DB_ONLY",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.channelAccessToken, "ccp-line-only-token");
});

test("FACEBOOK DB_WITH_ENV_FALLBACK uses channel_connect DB credential", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-fb-1",
    provider: "FACEBOOK",
    providerPageId: "page-ccp-1"
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "ccp-facebook-token" }
  });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.pageAccessToken, "ccp-facebook-token");
});

test("INSTAGRAM DB_WITH_ENV_FALLBACK uses channel_connect DB credential", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-ig-1",
    provider: "INSTAGRAM",
    providerPageId: "page-ig-ccp-1",
    providerIgAccountId: "ig-ccp-biz-1"
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("INSTAGRAM", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "ccp-instagram-token" }
  });

  const resolved = await resolveInstagramWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: instagramEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyInstagramRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  assert.equal(resolved.credentials.accessToken, "ccp-instagram-token");
  assert.equal(resolved.credentials.pageId, "page-ig-ccp-1");
});

test("createLineOutboundAdapterResolver flag off does not touch ChannelConnectionRepository", async () => {
  const { repository, callCounts } = createTrackingChannelConnectionRepository(baseLineConnection());
  const resolver = createLineOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: false
  });

  await resolver.resolve(TENANT);
  assert.equal(callCounts.findByTenantAndProvider, 0);
});

test("worker outbound resolution errors and logs do not leak secrets", async () => {
  const logPayloads: Record<string, unknown>[] = [];
  const { repository } = createTrackingChannelConnectionRepository(baseLineConnection(), {
    metadata: [credentialMetadata("LINE", "ACCESS_TOKEN"), credentialMetadata("LINE", "CHANNEL_SECRET")],
    decryptMap: {
      ACCESS_TOKEN: "ccp-line-token",
      CHANNEL_SECRET: "ccp-line-secret"
    }
  });

  await resolveLineWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: lineEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyLineRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true,
    logger: {
      info: (payload: Record<string, unknown>) => {
        logPayloads.push(payload);
      }
    } as any
  });

  const serialized = JSON.stringify(logPayloads);
  assert.equal(serialized.includes("ccp-line-token"), false);
  assert.equal(serialized.includes("ccp-line-secret"), false);
  assert.equal(serialized.includes("legacy-line-token"), false);
});

test("sendOutboundMessage routing logic is unchanged", () => {
  const source = readFileSync(new URL("../usecases/sendOutboundMessage.ts", import.meta.url), "utf8");
  assert.match(source, /resolveFacebookOutboundRoute/);
  assert.match(source, /resolveInstagramOutboundRoute/);
  assert.match(source, /INSTAGRAM_COMMENT_PRIVATE_REPLY/);
  assert.match(source, /MESSENGER_DM/);
});

test("Instagram image validation module unchanged", () => {
  const source = readFileSync(new URL("../../lib/mediaPolicy.ts", import.meta.url), "utf8");
  assert.match(source, /validateInstagramOutboundImageMedia/);
});

test("worker wires Channel Connect resolver flag without enabling it by default", () => {
  const source = readFileSync(new URL("../../worker/main.ts", import.meta.url), "utf8");
  assert.match(source, /isChannelConnectResolverEnabled/);
  assert.match(source, /channelConnectResolverEnabled/);
  assert.match(source, /channelConnectionRepository/);
  assert.doesNotMatch(source, /HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED\s*=\s*["']true["']/);
});

test("createFacebookOutboundAdapterResolver returns Facebook adapter when channel_connect resolves", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    provider: "FACEBOOK",
    providerPageId: "page-ccp-1"
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "ccp-facebook-token" }
  });
  const resolver = createFacebookOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });
  const adapter = await resolver.resolve(TENANT);
  assert.equal(adapter.channel, "FACEBOOK");
});

test("createInstagramOutboundAdapterResolver returns Instagram adapter when channel_connect resolves", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    provider: "INSTAGRAM",
    providerPageId: "page-ig-ccp-1",
    providerIgAccountId: "ig-ccp-biz-1"
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("INSTAGRAM", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "ccp-instagram-token" }
  });
  const resolver = createInstagramOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: instagramEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyInstagramRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });
  const adapter = await resolver.resolve(TENANT);
  assert.equal(adapter.channel, "INSTAGRAM");
});
