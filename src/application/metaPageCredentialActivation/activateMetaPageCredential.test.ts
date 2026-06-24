import test from "node:test";
import assert from "node:assert/strict";
import { ActivateMetaPageCredentialUseCase } from "./activateMetaPageCredential.js";
import {
  createVerifiedMetaPageCredentialProof,
  VERIFIED_META_PAGE_PROOF_FACTORY
} from "../metaPageCredentialVerification/verifiedMetaPageCredentialProofFactory.js";
import type { ChannelConnectionRecord } from "../../domain/channelConnections.js";
import type { MetaPageCredentialActivationPort } from "../../domain/ports.js";
import type { MetaPageCredentialRepository } from "../../domain/ports.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import { VerifyMetaPageCredentialUseCase } from "../metaPageCredentialVerification/verifyMetaPageCredential.js";
import { MetaPageCredentialVerificationError } from "../../domain/metaPageCredentialVerificationErrors.js";
import { MetaPageCredentialActivationApiError } from "../../lib/metaPageCredentialActivationApiErrors.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const FB_CONNECTION = "cc111111-1111-4111-8111-111111111111";
const IG_CONNECTION = "cc222222-2222-4222-8222-222222222222";
const TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";
const TEST_KEY = "b".repeat(64);

function fbConnection(): ChannelConnectionRecord {
  const now = new Date("2035-01-01T00:00:00.000Z");
  return {
    id: FB_CONNECTION,
    tenantId: TENANT,
    provider: "FACEBOOK",
    status: "CONNECTED",
    providerAccountId: "9876543210",
    providerAccountName: "Page",
    providerPageId: "9876543210",
    providerIgAccountId: null,
    publicConnectionKey: "key",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function igConnection(): ChannelConnectionRecord {
  const now = new Date("2035-01-01T00:00:00.000Z");
  return {
    id: IG_CONNECTION,
    tenantId: TENANT,
    provider: "INSTAGRAM",
    status: "CONNECTED",
    providerAccountId: "17841400000000001",
    providerAccountName: "IG",
    providerPageId: null,
    providerIgAccountId: "17841400000000001",
    publicConnectionKey: "key2",
    webhookEndpoint: null,
    webhookActive: false,
    lastInboundVerifiedAt: null,
    lastOutboundVerifiedAt: null,
    lastHealthCheckAt: null,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    connectedBy: null,
    connectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function buildProof() {
  return createVerifiedMetaPageCredentialProof(VERIFIED_META_PAGE_PROOF_FACTORY, {
    accessToken: TOKEN,
    metadata: {
      credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
      providerAppId: "1234567890",
      facebookPageId: "9876543210",
      instagramProfessionalAccountId: null,
      requestedChannels: ["FACEBOOK"],
      grantedScopes: ["pages_messaging", "pages_show_list"],
      tokenExpiresAt: "2035-01-01T00:00:00.000Z",
      dataAccessExpiresAt: "2035-01-01T00:00:00.000Z",
      providerTokenType: "PAGE",
      verificationVersion: 1,
      verifiedAt: "2035-01-01T00:00:00.000Z",
      tokenFingerprint: "fp-test"
    }
  });
}

function buildUseCase(input: {
  verify?: () => Promise<ReturnType<typeof buildProof>>;
  activate?: MetaPageCredentialActivationPort["activate"];
  connections?: ChannelConnectionRecord[];
  encryptionKey?: string | null;
  fetchFn?: typeof fetch;
}) {
  const connections = new Map((input.connections ?? [fbConnection()]).map((c) => [c.id, c]));
  const channelConnectionRepository: Pick<ChannelConnectionRepository, "findById"> = {
    async findById(tenantId, connectionId) {
      const row = connections.get(connectionId);
      if (!row || row.tenantId !== tenantId) return null;
      return row;
    }
  };

  const verifyMetaPageCredential = {
    execute: input.verify ?? (async () => buildProof())
  } as unknown as VerifyMetaPageCredentialUseCase;

  let activationCalls = 0;
  const activationPort: MetaPageCredentialActivationPort = {
    activate: async (portInput) => {
      activationCalls += 1;
      if (input.activate) return input.activate(portInput);
      return {
        activationStatus: "ACTIVATED_PENDING_HEALTH",
        credentialId: "cred-1",
        credentialVersion: 1,
        bindings: [
          {
            channelType: "FACEBOOK",
            channelConnectionId: FB_CONNECTION,
            bindingId: "bind-1",
            credentialVersion: 1
          }
        ],
        idempotencyReplay: false
      };
    }
  };

  const metaPageCredentialRepository: Pick<
    MetaPageCredentialRepository,
    "retrieveDecryptedMaterial" | "listBindingsForCredential" | "getCredentialById"
  > = {
    async getCredentialById() {
      return {
        id: "cred-1",
        tenantId: TENANT,
        credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
        providerAppId: "1234567890",
        facebookPageId: "9876543210",
        instagramProfessionalAccountId: null,
        tokenFingerprint: "fp-test",
        encryptionFormatVersion: "v1",
        keyVersion: 1,
        credentialVersion: 1,
        status: "ACTIVE",
        verifiedAt: "2035-01-01T00:00:00.000Z",
        lastVerifiedAt: "2035-01-01T00:00:00.000Z",
        lastErrorSanitized: null,
        createdAt: "2035-01-01T00:00:00.000Z",
        updatedAt: "2035-01-01T00:00:00.000Z"
      };
    },
    async retrieveDecryptedMaterial() {
      return {
        tenantId: TENANT,
        credentialId: "cred-1",
        accessToken: TOKEN,
        credentialVersion: 1,
        facebookPageId: "9876543210",
        instagramProfessionalAccountId: null
      };
    },
    async listBindingsForCredential() {
      return [
        {
          id: "bind-1",
          tenantId: TENANT,
          credentialId: "cred-1",
          channelConnectionId: FB_CONNECTION,
          channelType: "FACEBOOK",
          bindingStatus: "ACTIVE",
          credentialVersion: 1,
          activatedAt: "2035-01-01T00:00:00.000Z",
          createdAt: "2035-01-01T00:00:00.000Z",
          updatedAt: "2035-01-01T00:00:00.000Z"
        }
      ];
    }
  };

  const prevKey = process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  if (input.encryptionKey === null) {
    delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  } else {
    process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = input.encryptionKey ?? TEST_KEY;
  }

  const useCase = new ActivateMetaPageCredentialUseCase({
    verifyMetaPageCredential,
    activationPort,
    metaPageCredentialRepository,
    channelConnectionRepository,
    expectedAppId: "1234567890",
    fetchFn:
      input.fetchFn ??
      (async () =>
        new Response(
          JSON.stringify({ id: "9876543210", name: "Page" }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
  });

  return {
    useCase,
    getActivationCalls: () => activationCalls,
    restoreEnv() {
      if (prevKey === undefined) delete process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
      else process.env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY = prevKey;
    }
  };
}

test("orchestration verifies before activation RPC", async () => {
  let verified = false;
  const { useCase, getActivationCalls, restoreEnv } = buildUseCase({
    verify: async () => {
      verified = true;
      return buildProof();
    }
  });
  try {
    await useCase.execute({
      tenantId: TENANT,
      actorSalesAgentId: "agent-1",
      accessToken: TOKEN,
      facebookConnectionId: FB_CONNECTION,
      requestedChannels: ["FACEBOOK"],
      expectedCredentialVersion: 0,
      idempotencyKey: "idem-1"
    });
    assert.equal(verified, true);
    assert.equal(getActivationCalls(), 1);
  } finally {
    restoreEnv();
  }
});

test("orchestration makes zero activation RPC calls after verification failure", async () => {
  const { useCase, getActivationCalls, restoreEnv } = buildUseCase({
    verify: async () => {
      throw new MetaPageCredentialVerificationError("META_TOKEN_INVALID", "bad token", false);
    }
  });
  try {
    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: TENANT,
          actorSalesAgentId: null,
          accessToken: TOKEN,
          facebookConnectionId: FB_CONNECTION,
          requestedChannels: ["FACEBOOK"],
          expectedCredentialVersion: 0,
          idempotencyKey: "idem-2"
        }),
      (error: unknown) =>
        error instanceof MetaPageCredentialVerificationError &&
        error.code === "META_TOKEN_INVALID"
    );
    assert.equal(getActivationCalls(), 0);
  } finally {
    restoreEnv();
  }
});

test("orchestration makes zero activation RPC calls when encryption is unavailable", async () => {
  const { useCase, getActivationCalls, restoreEnv } = buildUseCase({
    encryptionKey: null
  });
  try {
    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: TENANT,
          actorSalesAgentId: null,
          accessToken: TOKEN,
          facebookConnectionId: FB_CONNECTION,
          requestedChannels: ["FACEBOOK"],
          expectedCredentialVersion: 0,
          idempotencyKey: "idem-3"
        }),
      (error: unknown) =>
        error instanceof MetaPageCredentialActivationApiError &&
        error.code === "META_ACTIVATION_FAILED"
    );
    assert.equal(getActivationCalls(), 0);
  } finally {
    restoreEnv();
  }
});

test("health pass returns ACTIVATED_HEALTHY_PENDING_CUTOVER", async () => {
  const { useCase, restoreEnv } = buildUseCase({});
  try {
    const result = await useCase.execute({
      tenantId: TENANT,
      actorSalesAgentId: null,
      accessToken: TOKEN,
      facebookConnectionId: FB_CONNECTION,
      requestedChannels: ["FACEBOOK"],
      expectedCredentialVersion: 0,
      idempotencyKey: "idem-4"
    });
    assert.equal(result.state, "ACTIVATED_HEALTHY_PENDING_CUTOVER");
    assert.equal(result.activationStatus, "ACTIVATED_PENDING_HEALTH");
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  } finally {
    restoreEnv();
  }
});

test("health failure after commit preserves credential and returns ACTIVATED_HEALTH_FAILED", async () => {
  const { useCase, restoreEnv } = buildUseCase({
    fetchFn: async () => new Response("error", { status: 500 })
  });
  try {
    const result = await useCase.execute({
      tenantId: TENANT,
      actorSalesAgentId: null,
      accessToken: TOKEN,
      facebookConnectionId: FB_CONNECTION,
      requestedChannels: ["FACEBOOK"],
      expectedCredentialVersion: 0,
      idempotencyKey: "idem-5"
    });
    assert.equal(result.state, "ACTIVATED_HEALTH_FAILED");
    assert.equal(result.credentialId, "cred-1");
  } finally {
    restoreEnv();
  }
});

test("cross-tenant connection is rejected before verification", async () => {
  const otherTenantConnection = { ...fbConnection(), tenantId: "other-tenant" };
  const { useCase, getActivationCalls, restoreEnv } = buildUseCase({
    connections: [otherTenantConnection]
  });
  try {
    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: TENANT,
          actorSalesAgentId: null,
          accessToken: TOKEN,
          facebookConnectionId: FB_CONNECTION,
          requestedChannels: ["FACEBOOK"],
          expectedCredentialVersion: 0,
          idempotencyKey: "idem-6"
        }),
      (error: unknown) =>
        error instanceof MetaPageCredentialActivationApiError &&
        error.code === "META_CONNECTION_NOT_FOUND"
    );
    assert.equal(getActivationCalls(), 0);
  } finally {
    restoreEnv();
  }
});

test("activation port receives ciphertext only", async () => {
  let sawCiphertext = false;
  const { useCase, restoreEnv } = buildUseCase({
    activate: async (input) => {
      sawCiphertext = input.encryptedAccessTokenCiphertext.startsWith("v1:");
      assert.equal(input.encryptedAccessTokenCiphertext.includes(TOKEN), false);
      return {
        activationStatus: "ACTIVATED_PENDING_HEALTH",
        credentialId: "cred-1",
        credentialVersion: 1,
        bindings: [
          {
            channelType: "FACEBOOK",
            channelConnectionId: FB_CONNECTION,
            bindingId: "bind-1",
            credentialVersion: 1
          }
        ],
        idempotencyReplay: false
      };
    }
  });
  try {
    await useCase.execute({
      tenantId: TENANT,
      actorSalesAgentId: null,
      accessToken: TOKEN,
      facebookConnectionId: FB_CONNECTION,
      requestedChannels: ["FACEBOOK"],
      expectedCredentialVersion: 0,
      idempotencyKey: "idem-7"
    });
    assert.equal(sawCiphertext, true);
  } finally {
    restoreEnv();
  }
});

test("dual-channel request requires instagram connection metadata", async () => {
  const { useCase, getActivationCalls, restoreEnv } = buildUseCase({
    connections: [fbConnection(), igConnection()]
  });
  try {
    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: TENANT,
          actorSalesAgentId: null,
          accessToken: TOKEN,
          facebookConnectionId: FB_CONNECTION,
          requestedChannels: ["FACEBOOK", "INSTAGRAM"],
          expectedCredentialVersion: 0,
          idempotencyKey: "idem-8"
        }),
      (error: unknown) =>
        error instanceof MetaPageCredentialActivationApiError &&
        error.code === "META_ACTIVATION_INPUT_INVALID"
    );
    assert.equal(getActivationCalls(), 0);
  } finally {
    restoreEnv();
  }
});
