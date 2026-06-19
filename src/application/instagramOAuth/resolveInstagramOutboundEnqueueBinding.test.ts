import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { InstagramOAuthCredentialMetadata } from "../../domain/instagramOAuthCredentials.js";
import type { ResolveInstagramOutboundEnqueueBindingDeps } from "./resolveInstagramOutboundEnqueueBinding.js";
import {
  InstagramOutboundEnqueueBindingError,
  resolveInstagramOutboundEnqueueBinding
} from "./resolveInstagramOutboundEnqueueBinding.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "cc111111-1111-4111-8111-111111111111";

const oauthConnection: ChannelConnectionRecord = {
  id: CONNECTION,
  tenantId: TENANT,
  provider: "INSTAGRAM",
  status: "READY",
  providerAccountId: "17841400000000000",
  providerAccountName: "OAuth IG",
  providerPageId: null,
  providerIgAccountId: "17841400000000000",
  publicConnectionKey: "ig-oauth-key",
  webhookEndpoint: null,
  webhookActive: false,
  lastInboundVerifiedAt: null,
  lastOutboundVerifiedAt: null,
  lastHealthCheckAt: null,
  lastErrorCode: null,
  lastErrorMessageSafe: null,
  connectedBy: null,
  connectedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

const oauthCredential: InstagramOAuthCredentialMetadata = {
  id: "cred-1",
  tenantId: TENANT,
  channelConnectionId: CONNECTION,
  provider: "INSTAGRAM",
  authFamily: "INSTAGRAM_BUSINESS_LOGIN",
  credentialStatus: "ACTIVE",
  providerInstagramAccountId: "17841400000000000",
  providerUserId: "user-1",
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
};

function makeDeps(overrides: {
  connection?: ChannelConnectionRecord | null;
  tenantConnection?: ChannelConnectionRecord | null;
  credentials?: InstagramOAuthCredentialMetadata[];
  legacyConfigured?: boolean;
} = {}) {
  return {
    channelConnectionRepository: {
      findById: async (_tenantId: string, id: string) =>
        id === CONNECTION ? (overrides.connection ?? oauthConnection) : null,
      findByTenantAndProvider: async () => overrides.tenantConnection ?? oauthConnection
    },
    instagramOAuthCredentialRepository: {
      findByConnection: async () => overrides.credentials ?? [oauthCredential]
    },
    channelSettingRepository: {
      findByTenantAndChannel: async () => ({ configured: overrides.legacyConfigured ?? false }),
      getRuntimeConfigForConnectionTest: async () =>
        overrides.legacyConfigured
          ? { secrets: { accessToken: "EAlegacy-token-value-for-test-only" } }
          : null
    }
  } as unknown as ResolveInstagramOutboundEnqueueBindingDeps;
}

test("non-Instagram channel emits no binding", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "LINE",
      messageType: "TEXT",
      providerThreadType: null,
      channelConnectionId: CONNECTION
    },
    makeDeps()
  );
  assert.equal(binding, null);
});

test("OAuth DM text emits exact connection-bound binding", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "INSTAGRAM",
      messageType: "TEXT",
      providerThreadType: "INSTAGRAM_DM",
      channelConnectionId: CONNECTION
    },
    makeDeps()
  );
  assert.equal(binding?.mode, "CONNECTION_BOUND");
  if (binding?.mode === "CONNECTION_BOUND") {
    assert.equal(binding.channelConnectionId, CONNECTION);
    assert.equal(binding.authFamily, "INSTAGRAM_BUSINESS_LOGIN");
    assert.equal(binding.deliveryPath, "DATABASE_ONLY");
    assert.equal(binding.messageKind, "TEXT");
  }
});

test("OAuth image emits IMAGE message kind", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "INSTAGRAM",
      messageType: "IMAGE",
      providerThreadType: "INSTAGRAM_DM",
      channelConnectionId: CONNECTION
    },
    makeDeps()
  );
  if (binding?.mode === "CONNECTION_BOUND") {
    assert.equal(binding.messageKind, "IMAGE");
  }
});

test("Instagram comment threads skip OAuth binding for private reply legacy path", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "INSTAGRAM",
      messageType: "TEXT",
      providerThreadType: "INSTAGRAM_COMMENT",
      channelConnectionId: CONNECTION
    },
    makeDeps()
  );
  assert.equal(binding, null);
});

test("legacy Instagram connection emits no binding", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "INSTAGRAM",
      messageType: "TEXT",
      providerThreadType: "INSTAGRAM_DM",
      channelConnectionId: CONNECTION
    },
    makeDeps({ credentials: [] })
  );
  assert.equal(binding, null);
});

test("missing OAuth channel_connection_id fails closed when legacy unavailable", async () => {
  await assert.rejects(
    () =>
      resolveInstagramOutboundEnqueueBinding(
        {
          tenantId: TENANT,
          channel: "INSTAGRAM",
          messageType: "TEXT",
          providerThreadType: "INSTAGRAM_DM",
          channelConnectionId: null
        },
        makeDeps({ legacyConfigured: false })
      ),
    InstagramOutboundEnqueueBindingError
  );
});

test("historical null binding remains legacy when page token exists", async () => {
  const binding = await resolveInstagramOutboundEnqueueBinding(
    {
      tenantId: TENANT,
      channel: "INSTAGRAM",
      messageType: "TEXT",
      providerThreadType: "INSTAGRAM_DM",
      channelConnectionId: null
    },
    makeDeps({ legacyConfigured: true })
  );
  assert.equal(binding, null);
});

test("wrong tenant connection rejected", async () => {
  await assert.rejects(
    () =>
      resolveInstagramOutboundEnqueueBinding(
        {
          tenantId: TENANT,
          channel: "INSTAGRAM",
          messageType: "TEXT",
          providerThreadType: "INSTAGRAM_DM",
          channelConnectionId: "00000000-0000-4000-8000-000000000099"
        },
        makeDeps()
      ),
    InstagramOutboundEnqueueBindingError
  );
});

test("ambiguous OAuth plus legacy configuration rejected", async () => {
  await assert.rejects(
    () =>
      resolveInstagramOutboundEnqueueBinding(
        {
          tenantId: TENANT,
          channel: "INSTAGRAM",
          messageType: "TEXT",
          providerThreadType: "INSTAGRAM_DM",
          channelConnectionId: CONNECTION
        },
        makeDeps({ legacyConfigured: true })
      ),
    InstagramOutboundEnqueueBindingError
  );
});
