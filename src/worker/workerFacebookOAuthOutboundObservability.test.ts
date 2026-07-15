import test from "node:test";
import assert from "node:assert/strict";
import type {
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType
} from "../domain/channelConnections.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../domain/ports.js";
import type { ChannelRuntimeConfig } from "../domain/channelSettings.js";
import { ChannelConnectRuntimeResolverError } from "../application/channelConnect/channelConnectRuntimeResolver.js";
import { DbQueue } from "../infrastructure/adapters/queue/dbQueue.js";
import { createWorkerFacebookOutboundAdapterResolver } from "./workerOutboundComposition.js";

const TENANT = "tenant-worker-oauth-obs";

const facebookEnv = {
  FACEBOOK_PAGE_ACCESS_TOKEN: "env-facebook-page-token",
  FACEBOOK_PAGE_ID: "page-env-1",
  META_GRAPH_VERSION: "v25.0",
  HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
};

const legacyFacebookRuntime: ChannelRuntimeConfig = {
  tenantId: TENANT,
  channel: "FACEBOOK",
  enabled: true,
  providerPageId: "legacy-page-1",
  providerAccountName: null,
  secrets: { accessToken: "legacy-facebook-token" }
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

function credentialMetadata(
  provider: "FACEBOOK",
  credentialType: ChannelCredentialType
): ChannelCredentialMetadataDto {
  return {
    connectionId: "conn-oauth-obs",
    provider,
    credentialType,
    credentialState: "SET",
    secretFingerprint: "fp_test",
    tokenExpiresAt: null,
    updatedAt: "2026-06-04T00:00:00.000Z"
  };
}

function facebookOAuthConnection(id: string, pageId: string): ChannelConnectionRecord {
  return {
    id,
    tenantId: TENANT,
    provider: "FACEBOOK",
    status: "READY",
    providerAccountId: pageId,
    providerAccountName: null,
    providerPageId: pageId,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_fb_oauth_obs",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: new Date("2026-06-15T10:00:00.000Z"),
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z")
  };
}

function createOAuthRepository(input: {
  connection: ChannelConnectionRecord;
  decryptThrows?: boolean;
  decryptMap?: Partial<Record<ChannelCredentialType, string>>;
}): ChannelConnectionRepository {
  const metadata = [credentialMetadata("FACEBOOK", "ACCESS_TOKEN")];
  const decryptMap = input.decryptMap ?? {};
  const decryptThrows = input.decryptThrows ?? false;

  return {
    createConnection: async () => {
      throw new Error("not implemented");
    },
    listByTenant: async () => [input.connection],
    findById: async (_tenantId, connectionId) =>
      connectionId === input.connection.id ? input.connection : null,
    findByTenantAndProvider: async () => input.connection,
    findByTenantProviderAccount: async () => input.connection,
    listByProviderPageId: async () => [],
    findByPublicConnectionKey: async () => input.connection,
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
        connectionId: input.connection.id,
        provider: "FACEBOOK",
        credentialType,
        plaintextSecret: plaintext,
        tokenExpiresAt: null
      } satisfies ChannelCredentialRuntimeSecret;
    }
  };
}

function captureStderr(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (message?: unknown) => {
    lines.push(String(message));
  };
  return run()
    .catch(() => undefined)
    .finally(() => {
      console.error = original;
    })
    .then(() => lines);
}

function parseStderrEvents(lines: string[]): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("worker Facebook resolver composition emits stderr diagnostic on OAuth credential failure", async () => {
  const connection = facebookOAuthConnection("conn-oauth-obs", "541846535686129");
  const repository = createOAuthRepository({ connection, decryptThrows: true });
  const resolver = createWorkerFacebookOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  const stderrLines = await captureStderr(async () => {
    await assert.rejects(
      () =>
        resolver.resolve(TENANT, {
          channelConnectionId: connection.id,
          providerPageId: connection.providerPageId
        }),
      (err: ChannelConnectRuntimeResolverError) => {
        assert.equal(err.blockLegacyFallback, true);
        assert.equal(err.diagnosticCode, "credential_decrypt_failed");
        return true;
      }
    );
  });

  const failureEvents = parseStderrEvents(stderrLines).filter(
    (entry) => entry.event === "facebook_oauth_outbound_credential_failure"
  );
  assert.equal(failureEvents.length, 1);
  assert.equal(failureEvents[0]?.diagnosticCode, "credential_decrypt_failed");
  assert.equal(failureEvents[0]?.tenantId, TENANT);
  assert.equal(failureEvents[0]?.providerPageId, "541846535686129");
  assert.equal(JSON.stringify(failureEvents[0]).includes(facebookEnv.FACEBOOK_PAGE_ACCESS_TOKEN), false);
  assert.equal(JSON.stringify(failureEvents[0]).includes(facebookEnv.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY), false);
});

test("worker Facebook resolver success emits no OAuth failure diagnostic", async () => {
  const connection = facebookOAuthConnection("conn-oauth-ok", "541846535686129");
  const repository = createOAuthRepository({
    connection,
    decryptMap: { ACCESS_TOKEN: "oauth-page-token" }
  });
  const resolver = createWorkerFacebookOutboundAdapterResolver({
    mode: "DB_WITH_ENV_FALLBACK",
    env: facebookEnv,
    channelSettingRepository: legacyChannelSettingRepository(legacyFacebookRuntime),
    channelConnectionRepository: repository,
    resolverEnabled: true
  });

  const stderrLines = await captureStderr(async () => {
    const adapter = await resolver.resolve(TENANT, {
      channelConnectionId: connection.id,
      providerPageId: connection.providerPageId
    });
    assert.ok(adapter);
  });

  const failureEvents = parseStderrEvents(stderrLines).filter(
    (entry) => entry.event === "facebook_oauth_outbound_credential_failure"
  );
  assert.equal(failureEvents.length, 0);
});

test("DbQueue markFailed persists ChannelConnectRuntimeResolverError diagnosticCode in last_error", async () => {
  let updatePayload: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updatePayload = patch;
        return {
          eq: async (_col: string, _val: string) => ({ error: null })
        };
      }
    })
  };
  const queue = new DbQueue(supabase as never);
  const err = new ChannelConnectRuntimeResolverError(
    "FACEBOOK OAuth credentials are unavailable.",
    "credential_decrypt_failed",
    true
  );

  const result = await queue.markFailed({ id: "job-1", retryCount: 2, maxRetries: 8 }, err);

  assert.equal(result.deadLetter, false);
  assert.equal(result.retryCount, 3);
  assert.ok(updatePayload);
  const lastError = String((updatePayload as Record<string, unknown>)["last_error"] ?? "");
  assert.match(lastError, /ChannelConnectRuntimeResolverError/);
  assert.match(lastError, /diagnosticCode=credential_decrypt_failed/);
  assert.equal(lastError.includes("oauth-page-token"), false);
});

test("DbQueue markFailed retry semantics unchanged for resolver errors", async () => {
  let updatePayload: Record<string, unknown> | null = null;
  const supabase = {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updatePayload = patch;
        return {
          eq: async () => ({ error: null })
        };
      }
    })
  };
  const queue = new DbQueue(supabase as never);
  const err = new ChannelConnectRuntimeResolverError("FACEBOOK OAuth credentials are unavailable.", "db_credential_missing", true);

  const result = await queue.markFailed({ id: "job-2", retryCount: 7, maxRetries: 8 }, err);

  assert.equal(result.deadLetter, true);
  assert.ok(updatePayload);
  const patch = updatePayload as unknown as Record<string, unknown>;
  assert.equal(patch["status"], "DEAD_LETTER");
});
