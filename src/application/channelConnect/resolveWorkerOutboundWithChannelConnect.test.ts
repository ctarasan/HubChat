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
import { MetaPageCredentialRuntimeResolverError } from "../../domain/metaPageCredentialRuntimeResolver.js";
import type { MetaPageCredentialRepository } from "../../domain/ports.js";

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
  connection: ChannelConnectionRecord | ChannelConnectionRecord[] | null,
  options: {
    metadata?: ChannelCredentialMetadataDto[];
    decryptMap?: Partial<Record<ChannelCredentialType, string>>;
    decryptThrows?: boolean;
  } = {}
): { repository: ChannelConnectionRepository; callCounts: { findByTenantAndProvider: number } } {
  const connections = Array.isArray(connection) ? connection : connection ? [connection] : [];
  const primary = connections[0] ?? null;
  const callCounts = { findByTenantAndProvider: 0 };
  const metadata = options.metadata ?? [];
  const decryptMap = options.decryptMap ?? {};
  const decryptThrows = options.decryptThrows ?? false;

  const repository: ChannelConnectionRepository = {
    createConnection: async () => {
      throw new Error("not implemented");
    },
    listByTenant: async () => connections,
    findById: async (_tenantId, connectionId) =>
      connections.find((row) => row.id === connectionId) ?? null,
    findByTenantAndProvider: async () => {
      callCounts.findByTenantAndProvider += 1;
      return primary;
    },
    findByTenantProviderAccount: async () => primary,
    listByProviderPageId: async () => [],
    findByPublicConnectionKey: async () => primary,
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
    retrieveDecryptedCredentialForRuntime: async ({ connectionId, credentialType }) => {
      if (decryptThrows) throw new Error("decrypt failed");
      const plaintext = decryptMap[credentialType];
      if (!plaintext) return null;
      const matched = connections.find((row) => row.id === connectionId) ?? primary;
      return {
        tenantId: TENANT,
        connectionId: matched?.id ?? connectionId,
        provider: matched?.provider ?? "LINE",
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
  assert.match(source, /isMetaPageCredentialEnabled/);
  assert.match(source, /metaPageCredentialEnabled/);
  assert.doesNotMatch(source, /HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED\s*=\s*["']true["']/);
  assert.doesNotMatch(source, /HUBCHAT_META_PAGE_CREDENTIAL_ENABLED\s*=\s*["']true["']/);
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
  const adapter = await resolver.resolve(TENANT, { providerPageId: "page-ccp-1" });
  assert.equal(adapter.channel, "FACEBOOK");
});

test("FACEBOOK OAuth-managed READY uses channel_credentials for worker outbound", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-fb-oauth-1",
    provider: "FACEBOOK",
    status: "READY",
    providerPageId: "page-oauth-1",
    providerAccountId: "page-oauth-1",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "oauth-worker-page-token" }
  });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    providerPageId: "page-oauth-1",
    resolverEnabled: true
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.pageAccessToken, "oauth-worker-page-token");
  assert.equal(resolved.credentials.providerPageId, "page-oauth-1");
});

test("FACEBOOK OAuth-managed decrypt failure does not fall back to manual/env", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-fb-oauth-2",
    provider: "FACEBOOK",
    status: "READY",
    providerPageId: "page-oauth-2",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptThrows: true
  });

  await assert.rejects(
    () =>
      resolveFacebookWorkerOutboundConfig({
        mode: "DB_WITH_ENV_FALLBACK",
        tenantId: TENANT,
        env: facebookEnv,
        channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
        channelConnectionRepository: repository,
        providerPageId: "page-oauth-2",
        resolverEnabled: true
      }),
    (err: ChannelConnectRuntimeResolverError) => {
      assert.equal(err.blockLegacyFallback, true);
      assert.equal(err.message.includes("legacy-facebook-token"), false);
      assert.equal(err.message.includes("env-facebook-page-token"), false);
      return true;
    }
  );
});

test("FACEBOOK OAuth-managed AUTHORIZING does not fall back to env", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-fb-oauth-3",
    provider: "FACEBOOK",
    status: "AUTHORIZING",
    providerPageId: "page-oauth-3",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "oauth-should-not-send" }
  });

  await assert.rejects(
    () =>
      resolveFacebookWorkerOutboundConfig({
        mode: "DB_WITH_ENV_FALLBACK",
        tenantId: TENANT,
        env: facebookEnv,
        channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
        channelConnectionRepository: repository,
        providerPageId: "page-oauth-3",
        resolverEnabled: true
      }),
    (err: ChannelConnectRuntimeResolverError) => err.blockLegacyFallback === true
  );
});

test("FACEBOOK OAuth-managed Page mismatch blocks outbound without env fallback", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-fb-oauth-4",
    provider: "FACEBOOK",
    status: "READY",
    providerPageId: "page-oauth-4",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
  });

  await assert.rejects(
    () =>
      resolveFacebookWorkerOutboundConfig({
        mode: "DB_WITH_ENV_FALLBACK",
        tenantId: TENANT,
        env: facebookEnv,
        channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
        channelConnectionRepository: repository,
        providerPageId: "different-page-id",
        resolverEnabled: true
      }),
    (err: ChannelConnectRuntimeResolverError) => err.blockLegacyFallback === true
  );
});

test("FACEBOOK worker outbound resolves legacy unbound conversation by unique READY Page match", async () => {
  const oauthReady: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "507d5519-8f4f-4973-99f1-7b00af25279d",
    provider: "FACEBOOK",
    status: "READY",
    providerPageId: "541846535686129",
    providerAccountId: "541846535686129",
    connectedAt: new Date("2026-06-15T10:00:00.000Z")
  };
  const legacyReady: ChannelConnectionRecord = {
    ...oauthReady,
    id: "conn-legacy-ready",
    providerPageId: "1137356672785125",
    providerAccountId: "1137356672785125"
  };
  const { repository } = createTrackingChannelConnectionRepository([legacyReady, oauthReady], {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "oauth-worker-page-token" }
  });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    channelConnectionId: null,
    providerPageId: "541846535686129",
    resolverEnabled: true
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.pageAccessToken, "oauth-worker-page-token");
  assert.equal(resolved.credentials.providerPageId, "541846535686129");
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

function fakeMetaPageRepository(input: {
  bindings?: Array<{
    id: string;
    tenantId: string;
    credentialId: string;
    channelConnectionId: string;
    channelType: "FACEBOOK" | "INSTAGRAM";
    bindingStatus: "PENDING" | "ACTIVE" | "DISABLED" | "ERROR";
    credentialVersion: number;
    activatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  active?: boolean;
  token?: string;
  decryptFails?: boolean;
}): MetaPageCredentialRepository {
  const binding = input.bindings?.[0];
  const credentialId = binding?.credentialId ?? "cred-1";
  return {
    createVerifiedCredential: async () => {
      throw new Error("not implemented");
    },
    getCredentialById: async () => null,
    listBindingsForChannelConnection: async () => input.bindings ?? [],
    getActiveCredentialForBinding: async () =>
      input.active && binding
        ? {
            credential: {
              id: credentialId,
              tenantId: TENANT,
              credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
              providerAppId: "app-1",
              facebookPageId: "541812345678901",
              instagramProfessionalAccountId: null,
              tokenFingerprint: "fp",
              encryptionFormatVersion: "v1",
              keyVersion: 1,
              credentialVersion: binding.credentialVersion,
              status: "ACTIVE",
              verifiedAt: "2026-06-30T00:00:00.000Z",
              lastVerifiedAt: "2026-06-30T00:00:00.000Z",
              lastErrorSanitized: null,
              createdAt: "2026-06-30T00:00:00.000Z",
              updatedAt: "2026-06-30T00:00:00.000Z"
            },
            binding
          }
        : null,
    listBindingsForCredential: async () => [],
    bindChannelConnection: async () => {
      throw new Error("not implemented");
    },
    rotateCredentialWithExpectedVersion: async () => {
      throw new Error("not implemented");
    },
    revokeCredential: async () => {
      throw new Error("not implemented");
    },
    retrieveDecryptedMaterial: async () => {
      if (input.decryptFails) {
        const { MetaPageCredentialDecryptionFailedError } = await import(
          "../../domain/metaPageCredentialErrors.js"
        );
        throw new MetaPageCredentialDecryptionFailedError("Meta Page credential decryption failed");
      }
      return {
        tenantId: TENANT,
        credentialId,
        accessToken: input.token ?? "meta-page-runtime-token",
        credentialVersion: binding?.credentialVersion ?? 1,
        facebookPageId: "541812345678901",
        instagramProfessionalAccountId: null
      };
    }
  };
}

test("FACEBOOK flag OFF preserves Channel Connect path without Meta Page repository", async () => {
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
  const metaRepo = fakeMetaPageRepository({
    bindings: [
      {
        id: "b1",
        tenantId: TENANT,
        credentialId: "cred-1",
        channelConnectionId: "conn-fb-1",
        channelType: "FACEBOOK",
        bindingStatus: "ACTIVE",
        credentialVersion: 1,
        activatedAt: "2026-06-30T00:00:00.000Z",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    ],
    active: true,
    token: "meta-page-runtime-token"
  });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    metaPageCredentialRepository: metaRepo,
    channelConnectionId: "conn-fb-1",
    metaPageCredentialEnabled: false,
    resolverEnabled: true
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.pageAccessToken, "ccp-facebook-token");
});

test("FACEBOOK flag ON resolves managed Meta Page credential without legacy fallback", async () => {
  const { repository, callCounts } = createTrackingChannelConnectionRepository(null);
  const metaRepo = fakeMetaPageRepository({
    bindings: [
      {
        id: "b1",
        tenantId: TENANT,
        credentialId: "cred-1",
        channelConnectionId: "conn-managed-fb",
        channelType: "FACEBOOK",
        bindingStatus: "ACTIVE",
        credentialVersion: 1,
        activatedAt: "2026-06-30T00:00:00.000Z",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    ],
    active: true,
    token: "meta-page-runtime-token"
  });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    metaPageCredentialRepository: metaRepo,
    channelConnectionId: "conn-managed-fb",
    metaPageCredentialEnabled: true,
    resolverEnabled: true
  });

  assert.equal(resolved.source, "meta_page_credential");
  assert.equal(resolved.credentials.pageAccessToken, "meta-page-runtime-token");
  assert.equal(callCounts.findByTenantAndProvider, 0);
});

test("FACEBOOK flag ON unmanaged connection falls back to Channel Connect", async () => {
  const connection: ChannelConnectionRecord = {
    ...baseLineConnection(),
    id: "conn-unmanaged-fb",
    provider: "FACEBOOK",
    providerPageId: "page-ccp-1"
  };
  const { repository } = createTrackingChannelConnectionRepository(connection, {
    metadata: [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")],
    decryptMap: { ACCESS_TOKEN: "ccp-facebook-token" }
  });
  const metaRepo = fakeMetaPageRepository({ bindings: [] });

  const resolved = await resolveFacebookWorkerOutboundConfig({
    mode: "DB_WITH_ENV_FALLBACK",
    tenantId: TENANT,
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    metaPageCredentialRepository: metaRepo,
    channelConnectionId: "conn-unmanaged-fb",
    metaPageCredentialEnabled: true,
    resolverEnabled: true
  });

  assert.equal(resolved.source, "db");
  assert.equal(resolved.credentials.pageAccessToken, "ccp-facebook-token");
});

test("FACEBOOK flag ON managed invalid state fails closed without env fallback", async () => {
  const metaRepo = fakeMetaPageRepository({
    bindings: [
      {
        id: "b1",
        tenantId: TENANT,
        credentialId: "cred-1",
        channelConnectionId: "conn-managed-fb",
        channelType: "FACEBOOK",
        bindingStatus: "DISABLED",
        credentialVersion: 1,
        activatedAt: null,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    ]
  });

  await assert.rejects(
    () =>
      resolveFacebookWorkerOutboundConfig({
        mode: "DB_WITH_ENV_FALLBACK",
        tenantId: TENANT,
        env: facebookEnv,
        channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
        metaPageCredentialRepository: metaRepo,
        channelConnectionId: "conn-managed-fb",
        metaPageCredentialEnabled: true,
        resolverEnabled: true
      }),
    (err: MetaPageCredentialRuntimeResolverError) => {
      assert.equal(err.blockLegacyFallback, true);
      assert.equal(err.message.includes("env-facebook-page-token"), false);
      assert.equal(err.message.includes("legacy-facebook-token"), false);
      assert.equal(err.message.includes("meta-page-runtime-token"), false);
      return true;
    }
  );
});
