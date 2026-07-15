import test from "node:test";
import assert from "node:assert/strict";
import type {
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType
} from "../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../domain/ports.js";
import { resolveOutboundChannelCredential } from "../application/channelConnect/channelConnectRuntimeResolver.js";
import { SupabaseChannelConnectionRepository } from "../infrastructure/adapters/repositories/supabaseChannelConnectionRepository.js";
import { parseWorkerEnv } from "../lib/workerEnv.js";
import {
  encryptChannelCredentialPlaintext,
  resolveChannelCredentialEncryptionKey
} from "../lib/channelCredentialEncryption.js";
import {
  createWorkerChannelConnectionRepository,
  isWorkerEncryptionKeyConfigured
} from "./workerChannelConnectionComposition.js";

const TENANT = "tenant-encryption-wiring";
const TEST_KEY = "0123456789abcdef".repeat(4);
const OTHER_KEY = "fedcba9876543210".repeat(4);

function workerEnvWithKey(key?: string) {
  return parseWorkerEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    ...(key ? { HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: key } : {})
  } as unknown as NodeJS.ProcessEnv);
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
    publicConnectionKey: "ccp_fb_enc",
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

function credentialMetadata(connectionId: string): ChannelCredentialMetadataDto {
  return {
    connectionId,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    credentialState: "SET",
    secretFingerprint: "fp_test",
    tokenExpiresAt: null,
    updatedAt: "2026-06-04T00:00:00.000Z"
  };
}

function buildRepository(input: {
  connection: ChannelConnectionRecord;
  encryptedSecret: string;
  constructorKey?: string;
}): SupabaseChannelConnectionRepository {
  const client = {
    from(table: string) {
      if (table === "channel_connections") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              maybeSingle: async () => ({ data: null, error: null })
            };
          }
        };
      }
      if (table !== "channel_credentials") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: {
                tenant_id: TENANT,
                connection_id: input.connection.id,
                provider: "FACEBOOK",
                credential_type: "ACCESS_TOKEN",
                encrypted_secret_value: input.encryptedSecret,
                token_expires_at: null
              },
              error: null
            })
          };
        }
      };
    }
  };
  return new SupabaseChannelConnectionRepository(client as never, input.constructorKey);
}

function trackingRepository(connection: ChannelConnectionRecord): ChannelConnectionRepository {
  return {
    createConnection: async () => {
      throw new Error("not implemented");
    },
    listByTenant: async () => [connection],
    findById: async (_tenantId, connectionId) => (connectionId === connection.id ? connection : null),
    findByTenantAndProvider: async () => connection,
    findByTenantProviderAccount: async () => connection,
    listByProviderPageId: async () => [],
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
    listCredentialMetadataByConnection: async () => [credentialMetadata(connection.id)],
    storeEncryptedCredential: async () => {
      throw new Error("not implemented");
    },
    retrieveDecryptedCredentialForRuntime: async ({ credentialType }) => {
      const repo = buildRepository({
        connection,
        encryptedSecret: encryptChannelCredentialPlaintext("oauth-page-token", TEST_KEY),
        constructorKey: TEST_KEY
      });
      return repo.retrieveDecryptedCredentialForRuntime({
        tenantId: TENANT,
        connectionId: connection.id,
        credentialType
      });
    }
  };
}

test("worker composition startup and repository decrypt agree when parsed env omits key but process.env has it", async () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const connection = facebookOAuthConnection("conn-compose", "541846535686129");
  const encrypted = encryptChannelCredentialPlaintext("oauth-page-token", TEST_KEY);
  try {
    const env = workerEnvWithKey();
    assert.equal(isWorkerEncryptionKeyConfigured(env), true);
    const repo = createWorkerChannelConnectionRepository(
      {
        from(table: string) {
          if (table !== "channel_credentials") throw new Error(`unexpected table ${table}`);
          return {
            select() {
              return {
                eq() {
                  return this;
                },
                maybeSingle: async () => ({
                  data: {
                    tenant_id: TENANT,
                    connection_id: connection.id,
                    provider: "FACEBOOK",
                    credential_type: "ACCESS_TOKEN",
                    encrypted_secret_value: encrypted,
                    token_expires_at: null
                  },
                  error: null
                })
              };
            }
          };
        }
      } as never,
      env
    );
    const runtime = await repo.retrieveDecryptedCredentialForRuntime({
      tenantId: TENANT,
      connectionId: connection.id,
      credentialType: "ACCESS_TOKEN"
    });
    assert.equal(runtime?.plaintextSecret, "oauth-page-token");
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("resolver with parsed worker env does not return encryption_key_missing when process.env has key", async () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
  const connection = facebookOAuthConnection("conn-env-fallback", "541846535686129");
  try {
    const env = workerEnvWithKey();
    const resolved = await resolveOutboundChannelCredential(
      {
        channelConnectionRepository: trackingRepository(connection),
        env: {
          ...env,
          FACEBOOK_PAGE_ACCESS_TOKEN: "env-facebook-page-token",
          FACEBOOK_PAGE_ID: "page-env-1",
          META_GRAPH_VERSION: "v25.0"
        }
      },
      {
        provider: "FACEBOOK",
        tenantId: TENANT,
        mode: "DB_WITH_ENV_FALLBACK",
        resolverEnabled: true,
        channelConnectionId: connection.id,
        providerPageId: connection.providerPageId
      }
    );
    assert.equal(resolved.configSource, "DB");
    assert.equal(resolved.credentials.accessToken, "oauth-page-token");
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("repository decrypt with wrong constructor key surfaces decrypt failure not missing key", async () => {
  const connection = facebookOAuthConnection("conn-wrong-key", "541846535686129");
  const encrypted = encryptChannelCredentialPlaintext("oauth-page-token", TEST_KEY);
  const repo = buildRepository({ connection, encryptedSecret: encrypted, constructorKey: OTHER_KEY });
  await assert.rejects(() =>
    repo.retrieveDecryptedCredentialForRuntime({
      tenantId: TENANT,
      connectionId: connection.id,
      credentialType: "ACCESS_TOKEN"
    })
  );
});

test("repository without key reports missing on decrypt", async () => {
  const prev = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  const connection = facebookOAuthConnection("conn-no-key", "541846535686129");
  const encrypted = encryptChannelCredentialPlaintext("oauth-page-token", TEST_KEY);
  const repo = buildRepository({ connection, encryptedSecret: encrypted });
  try {
    await assert.rejects(
      () =>
        repo.retrieveDecryptedCredentialForRuntime({
          tenantId: TENANT,
          connectionId: connection.id,
          credentialType: "ACCESS_TOKEN"
        }),
      /Credential encryption key is not configured/
    );
  } finally {
    if (prev === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prev;
  }
});

test("invalid-format key is not classified as configured", () => {
  const resolved = resolveChannelCredentialEncryptionKey({
    env: { HUBCHAT_CREDENTIAL_ENCRYPTION_KEY: "${{ secrets.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY }}" }
  });
  assert.equal(resolved.status, "invalid_format");
  assert.equal(
    isWorkerEncryptionKeyConfigured(
      workerEnvWithKey("${{ secrets.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY }}")
    ),
    false
  );
});
