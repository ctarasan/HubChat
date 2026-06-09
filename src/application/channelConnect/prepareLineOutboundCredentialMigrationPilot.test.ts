import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ChannelConnectionRecord, ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import { assertSafeMigrationPlanPayload } from "../../lib/outboundCredentialMigrationValidation.js";
import {
  assertLinePilotProviderOnly,
  buildLineCredentialsFromEnv,
  prepareLineOutboundCredentialMigrationPilot,
  resolveLinePilotExecuteIntent,
  toSanitizedPilotJson
} from "./prepareLineOutboundCredentialMigrationPilot.js";

const TENANT = "tenant-ccp-3-3";
const FAKE_ACCESS = "unit-test-line-access-token-value-xyz";
const FAKE_SECRET = "unit-test-line-channel-secret-value-xyz";

function createTrackingRepository(): {
  repository: ChannelConnectionRepository;
  storeCalls: number;
} {
  const storeCalls = { value: 0 };
  const connection: ChannelConnectionRecord = {
    id: "conn-line-pilot",
    tenantId: TENANT,
    provider: "LINE",
    status: "READY",
    providerAccountId: "line-bot-pilot",
    providerAccountName: null,
    providerPageId: null,
    providerIgAccountId: null,
    publicConnectionKey: "ccp_line_pilot",
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
    createConnection: async (input) => ({ ...connection, tenantId: input.tenantId }),
    listByTenant: async () => [connection],
    findById: async () => connection,
    findByTenantAndProvider: async () => connection,
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
        provider: "LINE",
        credentialType: input.credentialType,
        credentialState: "SET",
        secretFingerprint: "fp_pilot_12",
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
    }
  };
}

const baseInput = () => ({
  tenantId: TENANT,
  providerAccountId: "line-bot-pilot",
  credentialsFromEnv: {
    channelAccessToken: FAKE_ACCESS,
    channelSecret: FAKE_SECRET
  },
  lineChannelAccessTokenEnvPresent: true,
  lineChannelSecretEnvPresent: true
});

test("default dry-run does not write", async () => {
  const tracking = createTrackingRepository();
  const result = await prepareLineOutboundCredentialMigrationPilot(
    { channelConnectionRepository: tracking.repository },
    baseInput()
  );

  assert.equal(result.mode, "dry_run");
  assert.equal(tracking.storeCalls, 0);
  assert.equal(result.provider, "LINE");
});

test("execute without dryRun false refuses (dry-run only)", async () => {
  const tracking = createTrackingRepository();
  const result = await prepareLineOutboundCredentialMigrationPilot(
    { channelConnectionRepository: tracking.repository },
    { ...baseInput(), execute: true }
  );

  assert.equal(result.mode, "dry_run");
  assert.equal(tracking.storeCalls, 0);
  assert.match(result.warnings.join(" "), /dryRun is not false|dry-run=false/i);
});

test("execute without explicit execute refuses", async () => {
  const intent = resolveLinePilotExecuteIntent({ execute: false, dryRun: false });
  assert.equal(intent.willExecute, false);
});

test("non-LINE provider rejected through pilot guard", () => {
  assert.throws(() => assertLinePilotProviderOnly("FACEBOOK"), /LINE/i);
});

test("missing LINE CHANNEL_SECRET reports sanitized MISSING", async () => {
  const result = await prepareLineOutboundCredentialMigrationPilot(
    {},
    {
      ...baseInput(),
      credentialsFromEnv: { channelAccessToken: FAKE_ACCESS },
      lineChannelSecretEnvPresent: false
    }
  );

  assert.equal(result.valid, false);
  const secretRow = result.credentials.find((c) => c.credentialType === "CHANNEL_SECRET");
  assert.equal(secretRow?.state, "MISSING");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(FAKE_SECRET), false);
});

test("missing LINE ACCESS_TOKEN reports sanitized MISSING", async () => {
  const result = await prepareLineOutboundCredentialMigrationPilot(
    {},
    {
      ...baseInput(),
      credentialsFromEnv: { channelSecret: FAKE_SECRET },
      lineChannelAccessTokenEnvPresent: false
    }
  );

  assert.equal(result.valid, false);
  const tokenRow = result.credentials.find((c) => c.credentialType === "ACCESS_TOKEN");
  assert.equal(tokenRow?.state, "MISSING");
});

test("placeholder credentials rejected in execute", async () => {
  const tracking = createTrackingRepository();
  await assert.rejects(
    () =>
      prepareLineOutboundCredentialMigrationPilot(
        { channelConnectionRepository: tracking.repository },
        {
          ...baseInput(),
          credentialsFromEnv: {
            channelAccessToken: "<LINE_CHANNEL_ACCESS_TOKEN>",
            channelSecret: "<LINE_CHANNEL_SECRET>"
          },
          execute: true,
          dryRun: false
        }
      ),
    (err: Error) => {
      assert.equal(err.message.includes("<LINE"), false);
      return true;
    }
  );
  assert.equal(tracking.storeCalls, 0);
});

test("dry-run output contains no fake secret values", async () => {
  const json = toSanitizedPilotJson(
    await prepareLineOutboundCredentialMigrationPilot({}, baseInput())
  );
  assert.equal(json.includes(FAKE_ACCESS), false);
  assert.equal(json.includes(FAKE_SECRET), false);
});

test("execute output errors and logs contain no fake secret values", async () => {
  const logs: Record<string, unknown>[] = [];
  const tracking = createTrackingRepository();
  const result = await prepareLineOutboundCredentialMigrationPilot(
    {
      channelConnectionRepository: tracking.repository,
      log: (p) => logs.push(p)
    },
    { ...baseInput(), execute: true, dryRun: false }
  );

  assert.equal(result.mode, "executed");
  const serialized = JSON.stringify({ result, logs });
  assert.equal(serialized.includes(FAKE_ACCESS), false);
  assert.equal(serialized.includes(FAKE_SECRET), false);
  assertSafeMigrationPlanPayload(result);
});

test("ops script does not import worker or webhook runtime paths", () => {
  const script = readFileSync(
    new URL("../../../scripts/ops/prepare-line-outbound-credential-migration.mjs", import.meta.url),
    "utf8"
  );
  assert.equal(script.includes("src/worker/"), false);
  assert.equal(script.includes("sendOutboundMessage"), false);
  assert.equal(script.includes("webhook/"), false);
  assert.equal(script.includes("HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED=true"), false);
});

test("pilot module does not import worker main", () => {
  const source = readFileSync(new URL("./prepareLineOutboundCredentialMigrationPilot.ts", import.meta.url), "utf8");
  assert.equal(source.includes("worker/main"), false);
  assert.equal(source.includes("sendOutboundMessage"), false);
});

test("buildLineCredentialsFromEnv reads env keys without exposing in pilot output", async () => {
  const creds = buildLineCredentialsFromEnv({
    LINE_CHANNEL_ACCESS_TOKEN: FAKE_ACCESS,
    LINE_CHANNEL_SECRET: FAKE_SECRET
  });
  assert.equal(creds.channelAccessToken, FAKE_ACCESS);
  const result = await prepareLineOutboundCredentialMigrationPilot({}, baseInput());
  assert.equal(JSON.stringify(result).includes(FAKE_ACCESS), false);
});
