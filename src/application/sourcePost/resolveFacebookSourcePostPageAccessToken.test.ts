import test from "node:test";
import assert from "node:assert/strict";
import type { ChannelConnectionRecord, ChannelCredentialMetadataDto } from "../../domain/channelConnections.js";
import {
  extractFacebookProviderPageId,
  resolveFacebookSourcePostPageAccessToken
} from "./resolveFacebookSourcePostPageAccessToken.js";

const SMARTKORP_PAGE = "541846535686129";
const CONNEX_PAGE = "657955874072241";
const SMARTKORP_TENANT = "tenant-smartkorp";
const CONNEX_TENANT = "tenant-connex";

function conn(overrides: Partial<ChannelConnectionRecord> & Pick<ChannelConnectionRecord, "id" | "tenantId" | "providerPageId">): ChannelConnectionRecord {
  return {
    id: overrides.id,
    tenantId: overrides.tenantId,
    provider: "FACEBOOK",
    status: overrides.status ?? "READY",
    providerAccountId: overrides.providerAccountId ?? null,
    providerAccountName: overrides.providerAccountName ?? null,
    providerPageId: overrides.providerPageId,
    providerIgAccountId: overrides.providerIgAccountId ?? null,
    publicConnectionKey: overrides.publicConnectionKey ?? `pk-${overrides.id}`,
    webhookEndpoint: null,
    webhookActive: true,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: overrides.connectedAt ?? new Date("2026-07-01T00:00:00.000Z"),
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
}

function meta(connectionId: string, state: ChannelCredentialMetadataDto["credentialState"] = "SET"): ChannelCredentialMetadataDto {
  return {
    connectionId,
    provider: "FACEBOOK",
    credentialType: "ACCESS_TOKEN",
    credentialState: state,
    secretFingerprint: "fp",
    tokenExpiresAt: null,
    updatedAt: new Date().toISOString()
  };
}

function repo(input: {
  connectionsByTenant: Record<string, ChannelConnectionRecord[]>;
  tokensByConnectionId: Record<string, string>;
  metadataByConnectionId?: Record<string, ChannelCredentialMetadataDto[]>;
}) {
  return {
    listByTenant: async (tenantId: string) => input.connectionsByTenant[tenantId] ?? [],
    listCredentialMetadataByConnection: async (_tenantId: string, connectionId: string) =>
      input.metadataByConnectionId?.[connectionId] ?? [meta(connectionId)],
    retrieveDecryptedCredentialForRuntime: async (args: {
      tenantId: string;
      connectionId: string;
      credentialType: string;
    }) => {
      const token = input.tokensByConnectionId[args.connectionId];
      if (!token) return null;
      return {
        tenantId: args.tenantId,
        connectionId: args.connectionId,
        provider: "FACEBOOK" as const,
        credentialType: "ACCESS_TOKEN" as const,
        plaintextSecret: token,
        tokenExpiresAt: null
      };
    }
  };
}

test("extractFacebookProviderPageId prefers facebookPageId then post id prefix", () => {
  assert.equal(
    extractFacebookProviderPageId({
      facebookPageId: SMARTKORP_PAGE,
      facebookPostId: `${CONNEX_PAGE}_999`
    }),
    SMARTKORP_PAGE
  );
  assert.equal(
    extractFacebookProviderPageId({
      facebookPageId: null,
      facebookPostId: `${SMARTKORP_PAGE}_122196402386780573`
    }),
    SMARTKORP_PAGE
  );
  assert.equal(extractFacebookProviderPageId({ facebookPostId: "no-separator" }), null);
});

test("resolves matching channel token for SmartKorp Page even when env token is wrong", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "a".repeat(64);
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: SMARTKORP_TENANT,
    facebookPageId: SMARTKORP_PAGE,
    facebookPostId: `${SMARTKORP_PAGE}_122196402386780573`,
    connections: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })],
    channelConnectionRepository: repo({
      connectionsByTenant: {
        [SMARTKORP_TENANT]: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })]
      },
      tokensByConnectionId: { "sk-conn": "smartkorp-page-token" }
    }),
    envPageAccessToken: "stale-env-token",
    envPageId: "1137356672785125"
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.source, "channel_connection");
  assert.equal(resolved.pageAccessToken, "smartkorp-page-token");
  assert.equal(resolved.connectionId, "sk-conn");
});

test("falls back to env token when matching channel credential unavailable", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "a".repeat(64);
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: SMARTKORP_TENANT,
    facebookPageId: SMARTKORP_PAGE,
    connections: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })],
    channelConnectionRepository: repo({
      connectionsByTenant: {
        [SMARTKORP_TENANT]: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })]
      },
      tokensByConnectionId: {},
      metadataByConnectionId: { "sk-conn": [meta("sk-conn", "EMPTY")] }
    }),
    envPageAccessToken: "legacy-env-token",
    envPageId: SMARTKORP_PAGE
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.source, "environment");
  assert.equal(resolved.pageAccessToken, "legacy-env-token");
  assert.equal(resolved.connectionId, null);
});

test("does not use env token for a different FACEBOOK_PAGE_ID", async () => {
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: SMARTKORP_TENANT,
    facebookPageId: SMARTKORP_PAGE,
    channelConnectionRepository: repo({
      connectionsByTenant: { [SMARTKORP_TENANT]: [] },
      tokensByConnectionId: {}
    }),
    envPageAccessToken: "wrong-page-env-token",
    envPageId: "1137356672785125"
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.reason, "env_unavailable");
});

test("SmartKorp tenant/Page cannot resolve Connex token", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "a".repeat(64);
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: SMARTKORP_TENANT,
    facebookPageId: SMARTKORP_PAGE,
    connections: [
      conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE }),
      conn({ id: "cx-conn", tenantId: CONNEX_TENANT, providerPageId: CONNEX_PAGE })
    ],
    channelConnectionRepository: repo({
      connectionsByTenant: {
        [SMARTKORP_TENANT]: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })],
        [CONNEX_TENANT]: [conn({ id: "cx-conn", tenantId: CONNEX_TENANT, providerPageId: CONNEX_PAGE })]
      },
      tokensByConnectionId: {
        "sk-conn": "smartkorp-page-token",
        "cx-conn": "connex-page-token"
      }
    }),
    envPageAccessToken: null,
    envPageId: null
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.pageAccessToken, "smartkorp-page-token");
  assert.notEqual(resolved.pageAccessToken, "connex-page-token");
});

test("Connex tenant/Page cannot resolve SmartKorp token", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "a".repeat(64);
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: CONNEX_TENANT,
    facebookPageId: CONNEX_PAGE,
    channelConnectionRepository: repo({
      connectionsByTenant: {
        [CONNEX_TENANT]: [conn({ id: "cx-conn", tenantId: CONNEX_TENANT, providerPageId: CONNEX_PAGE })],
        [SMARTKORP_TENANT]: [conn({ id: "sk-conn", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })]
      },
      tokensByConnectionId: {
        "cx-conn": "connex-page-token",
        "sk-conn": "smartkorp-page-token"
      }
    }),
    envPageAccessToken: null,
    envPageId: null
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.pageAccessToken, "connex-page-token");
  assert.notEqual(resolved.pageAccessToken, "smartkorp-page-token");
});

test("ambiguous Page mapping fails closed without selecting arbitrary credential", async () => {
  process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY || "a".repeat(64);
  const resolved = await resolveFacebookSourcePostPageAccessToken({
    tenantId: SMARTKORP_TENANT,
    facebookPageId: SMARTKORP_PAGE,
    connections: [
      conn({ id: "sk-a", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE }),
      conn({ id: "sk-b", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })
    ],
    channelConnectionRepository: repo({
      connectionsByTenant: {
        [SMARTKORP_TENANT]: [
          conn({ id: "sk-a", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE }),
          conn({ id: "sk-b", tenantId: SMARTKORP_TENANT, providerPageId: SMARTKORP_PAGE })
        ]
      },
      tokensByConnectionId: {
        "sk-a": "token-a",
        "sk-b": "token-b"
      }
    }),
    envPageAccessToken: "env-should-not-be-used",
    envPageId: SMARTKORP_PAGE
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.reason, "ambiguous_match");
});
