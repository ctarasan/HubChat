import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord, ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import {
  OutboundCredentialMigrationError,
  prepareOutboundCredentialMigration
} from "./prepareOutboundCredentialMigration.js";
import {
  assertSafeMigrationPlanPayload,
  isObviousPlaceholderCredential
} from "../../lib/outboundCredentialMigrationValidation.js";

const TENANT = "tenant-ccp-3-2";

function createTrackingRepository(): {
  repository: ChannelConnectionRepository;
  storeCalls: number;
  createCalls: number;
} {
  const storeCalls = { value: 0 };
  const createCalls = { value: 0 };
  const connection: ChannelConnectionRecord = {
    id: "conn-migrate-1",
    tenantId: TENANT,
    provider: "LINE",
    status: "READY",
    providerAccountId: "line-bot-1",
    providerAccountName: "Test OA",
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_migrate_key",
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

  const repository: ChannelConnectionRepository = {
    createConnection: async (input) => {
      createCalls.value += 1;
      return { ...connection, provider: input.provider, tenantId: input.tenantId };
    },
    listByTenant: async () => [connection],
    findById: async () => connection,
    findByTenantAndProvider: async (tenantId, provider) =>
      tenantId === TENANT ? { ...connection, provider } : null,
    findByTenantProviderAccount: async () => connection,
    findByPublicConnectionKey: async () => connection,
    updateLifecycleStatus: async () => connection,
    updateWebhookStatus: async () => connection,
    updateHealthFields: async () => connection,
    findPublicConnectionSummary: async () => null,
    listCredentialMetadataByConnection: async () => [],
    storeEncryptedCredential: async (input): Promise<ChannelCredentialMetadataDto> => {
      storeCalls.value += 1;
      return {
        connectionId: input.connectionId,
        provider: input.provider,
        credentialType: input.credentialType,
        credentialState: "SET",
        secretFingerprint: "fp_mock_12",
        tokenExpiresAt: null,
        updatedAt: "2026-06-04T00:00:00.000Z"
      };
    },
    retrieveDecryptedCredentialForRuntime: async () => null
  };

  return {
    repository,
    get storeCalls() {
      return storeCalls.value;
    },
    get createCalls() {
      return createCalls.value;
    }
  };
}

test("LINE dry-run valid plan", async () => {
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "LINE",
      displayName: "Test LINE OA",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: "unit-test-line-access-token-value",
        channelSecret: "unit-test-line-channel-secret-value"
      }
    }
  );

  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.valid, true);
  assert.equal(plan.provider, "LINE");
  assert.equal(plan.credentials.every((c) => c.state === "WOULD_SET"), true);
  assert.equal(plan.connectionId, null);
  assertSafeMigrationPlanPayload(plan);
});

test("FACEBOOK dry-run valid plan", async () => {
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "FACEBOOK",
      providerPageId: "page-123",
      credentials: { pageAccessToken: "unit-test-facebook-page-token-value" }
    }
  );

  assert.equal(plan.valid, true);
  assert.equal(plan.providerAccountIdPresent, false);
  assert.equal(plan.providerPageIdPresent, true);
  assert.equal(plan.credentials[0]?.state, "WOULD_SET");
});

test("INSTAGRAM dry-run valid plan", async () => {
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "INSTAGRAM",
      providerPageId: "page-ig-1",
      providerIgAccountId: "ig-biz-1",
      credentials: { accessToken: "unit-test-instagram-access-token-value" }
    }
  );

  assert.equal(plan.valid, true);
  assert.equal(plan.providerIgAccountIdPresent, true);
});

test("missing required credential rejected safely", async () => {
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: { channelAccessToken: "unit-test-line-access-token-value" }
    }
  );

  assert.equal(plan.valid, false);
  assert.equal(plan.errors.some((e) => e.includes("CHANNEL_SECRET")), true);
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes("unit-test-line-access-token-value"), false);
});

test("placeholder handling in dry-run allows angle-bracket placeholders", async () => {
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "FACEBOOK",
      providerPageId: "page-1",
      credentials: { pageAccessToken: "<FACEBOOK_PAGE_ACCESS_TOKEN>" }
    }
  );

  assert.equal(plan.valid, true);
  assert.equal(plan.credentials[0]?.state, "WOULD_SET");
  assert.equal(isObviousPlaceholderCredential("<FACEBOOK_PAGE_ACCESS_TOKEN>"), true);
});

test("execute mode rejects placeholders", async () => {
  await assert.rejects(
    () =>
      prepareOutboundCredentialMigration(
        { channelConnectionRepository: createTrackingRepository().repository },
        {
          tenantId: TENANT,
          provider: "FACEBOOK",
          providerPageId: "page-1",
          credentials: { pageAccessToken: "<FACEBOOK_PAGE_ACCESS_TOKEN>" },
          execute: true,
          dryRun: false
        }
      ),
    (err: OutboundCredentialMigrationError) => {
      assert.equal(err.message.includes("<FACEBOOK"), false);
      return err.name === "OutboundCredentialMigrationError";
    }
  );
});

test("dry-run does not call repository", async () => {
  const tracking = createTrackingRepository();
  await prepareOutboundCredentialMigration(
    { channelConnectionRepository: tracking.repository },
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: "unit-test-line-access-token-value",
        channelSecret: "unit-test-line-channel-secret-value"
      }
    }
  );
  assert.equal(tracking.storeCalls, 0);
  assert.equal(tracking.createCalls, 0);
});

test("execute mode stores credentials via repository with fake values", async () => {
  const tracking = createTrackingRepository();
  const plan = await prepareOutboundCredentialMigration(
    { channelConnectionRepository: tracking.repository },
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: "unit-test-line-access-token-value",
        channelSecret: "unit-test-line-channel-secret-value"
      },
      execute: true,
      dryRun: false
    }
  );

  assert.equal(plan.mode, "executed");
  assert.equal(plan.valid, true);
  assert.equal(tracking.storeCalls, 2);
  assert.equal(plan.connectionId, "conn-migrate-1");
  assert.equal(plan.storedCredentialFingerprints?.ACCESS_TOKEN, "fp_mock_12");
  assertSafeMigrationPlanPayload(plan);
});

test("returned summary excludes secret values", async () => {
  const secretAccess = "unit-test-line-access-token-value-xyz";
  const secretChannel = "unit-test-line-channel-secret-value-xyz";
  const plan = await prepareOutboundCredentialMigration(
    {},
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: secretAccess,
        channelSecret: secretChannel
      }
    }
  );

  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes(secretAccess), false);
  assert.equal(serialized.includes(secretChannel), false);
  assert.equal(serialized.includes("plaintextSecret"), false);
});

test("errors exclude token-like values", async () => {
  try {
    await prepareOutboundCredentialMigration(
      { channelConnectionRepository: createTrackingRepository().repository },
      {
        tenantId: TENANT,
        provider: "INSTAGRAM",
        credentials: { accessToken: "unit-test-token" },
        execute: true,
        dryRun: false
      }
    );
    assert.fail("expected throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert.equal(message.includes("unit-test-token"), false);
    assert.equal(/\bEA[A-Za-z0-9]{20,}\b/.test(message), false);
  }
});

test("execute with default dryRun stays dry-run", async () => {
  const tracking = createTrackingRepository();
  const plan = await prepareOutboundCredentialMigration(
    { channelConnectionRepository: tracking.repository },
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: "unit-test-line-access-token-value",
        channelSecret: "unit-test-line-channel-secret-value"
      },
      execute: true
    }
  );

  assert.equal(plan.mode, "dry_run");
  assert.equal(tracking.storeCalls, 0);
  assert.match(plan.warnings.join(" "), /dry-run only/i);
});

test("log payloads exclude secrets", async () => {
  const logs: Record<string, unknown>[] = [];
  await prepareOutboundCredentialMigration(
    {
      log: (payload) => logs.push(payload)
    },
    {
      tenantId: TENANT,
      provider: "LINE",
      providerAccountId: "line-bot-1",
      credentials: {
        channelAccessToken: "unit-test-line-access-token-value",
        channelSecret: "unit-test-line-channel-secret-value"
      }
    }
  );
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes("unit-test-line-access-token-value"), false);
  assert.equal(serialized.includes("unit-test-line-channel-secret-value"), false);
});
