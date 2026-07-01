import test from "node:test";
import assert from "node:assert/strict";
import { MetaPageCredentialRuntimeResolverError } from "../../domain/metaPageCredentialRuntimeResolver.js";
import type {
  MetaPageCredentialBindingMetadata,
  MetaPageCredentialMaterial,
  MetaPageCredentialMetadata
} from "../../domain/metaPageCredentials.js";
import type { MetaPageCredentialRepository } from "../../domain/ports.js";
import {
  resolveMetaPageRuntimeCredentialForFacebook,
  toMetaPageRuntimeResolverLogPayload
} from "./resolveMetaPageRuntimeCredential.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const CONNECTION = "507d5519-8f4f-4973-99f1-7b00af25279d";
const CREDENTIAL_ID = "c536d0ff-01ec-46ae-8a5a-75acac3f2acd";
const PAGE_TOKEN = "EAAfake-page-access-token-placeholder";

function binding(overrides?: Partial<MetaPageCredentialBindingMetadata>): MetaPageCredentialBindingMetadata {
  return {
    id: "binding-1",
    tenantId: TENANT,
    credentialId: CREDENTIAL_ID,
    channelConnectionId: CONNECTION,
    channelType: "FACEBOOK",
    bindingStatus: "ACTIVE",
    credentialVersion: 1,
    activatedAt: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

function credential(overrides?: Partial<MetaPageCredentialMetadata>): MetaPageCredentialMetadata {
  return {
    id: CREDENTIAL_ID,
    tenantId: TENANT,
    credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
    providerAppId: "app-1",
    facebookPageId: "541812345678901",
    instagramProfessionalAccountId: null,
    tokenFingerprint: "fp_test",
    encryptionFormatVersion: "v1",
    keyVersion: 1,
    credentialVersion: 1,
    status: "ACTIVE",
    verifiedAt: "2026-06-30T00:00:00.000Z",
    lastVerifiedAt: "2026-06-30T00:00:00.000Z",
    lastErrorSanitized: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

function material(overrides?: Partial<MetaPageCredentialMaterial>): MetaPageCredentialMaterial {
  return {
    tenantId: TENANT,
    credentialId: CREDENTIAL_ID,
    accessToken: PAGE_TOKEN,
    credentialVersion: 1,
    facebookPageId: "541812345678901",
    instagramProfessionalAccountId: null,
    ...overrides
  };
}

function fakeRepository(input: {
  bindings?: MetaPageCredentialBindingMetadata[];
  active?: { credential: MetaPageCredentialMetadata; binding: MetaPageCredentialBindingMetadata } | null;
  decrypted?: MetaPageCredentialMaterial | null;
  decryptThrows?: boolean;
}): MetaPageCredentialRepository {
  return {
    createVerifiedCredential: async () => {
      throw new Error("not implemented");
    },
    getCredentialById: async () => null,
    getActiveCredentialForBinding: async () => input.active ?? null,
    listBindingsForChannelConnection: async () => input.bindings ?? [],
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
      if (input.decryptThrows) {
        const { MetaPageCredentialDecryptionFailedError } = await import(
          "../../domain/metaPageCredentialErrors.js"
        );
        throw new MetaPageCredentialDecryptionFailedError("Meta Page credential decryption failed");
      }
      return input.decrypted ?? null;
    }
  };
}

test("resolveMetaPageRuntimeCredentialForFacebook returns unmanaged when no binding exists", async () => {
  const result = await resolveMetaPageRuntimeCredentialForFacebook(fakeRepository({ bindings: [] }), {
    tenantId: TENANT,
    channelConnectionId: CONNECTION
  });
  assert.deepEqual(result, { outcome: "unmanaged" });
});

test("resolveMetaPageRuntimeCredentialForFacebook resolves ACTIVE Facebook binding", async () => {
  const activeBinding = binding();
  const activeCredential = credential();
  const result = await resolveMetaPageRuntimeCredentialForFacebook(
    fakeRepository({
      bindings: [activeBinding],
      active: { credential: activeCredential, binding: activeBinding },
      decrypted: material()
    }),
    { tenantId: TENANT, channelConnectionId: CONNECTION }
  );
  assert.equal(result.outcome, "resolved");
  if (result.outcome === "resolved") {
    assert.equal(result.resolved.material.accessToken, PAGE_TOKEN);
    assert.equal(result.resolved.credential.credentialVersion, 1);
    assert.equal(result.resolved.binding.channelType, "FACEBOOK");
  }
});

test("resolveMetaPageRuntimeCredentialForFacebook fails closed on inactive binding", async () => {
  await assert.rejects(
    () =>
      resolveMetaPageRuntimeCredentialForFacebook(
        fakeRepository({ bindings: [binding({ bindingStatus: "DISABLED" })] }),
        { tenantId: TENANT, channelConnectionId: CONNECTION }
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialRuntimeResolverError &&
      err.diagnosticCode === "binding_inactive" &&
      err.blockLegacyFallback === true
  );
});

test("resolveMetaPageRuntimeCredentialForFacebook fails closed on Instagram binding channel type", async () => {
  await assert.rejects(
    () =>
      resolveMetaPageRuntimeCredentialForFacebook(
        fakeRepository({ bindings: [binding({ channelType: "INSTAGRAM" })] }),
        { tenantId: TENANT, channelConnectionId: CONNECTION }
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialRuntimeResolverError &&
      err.diagnosticCode === "binding_channel_mismatch"
  );
});

test("resolveMetaPageRuntimeCredentialForFacebook fails closed on ambiguous bindings", async () => {
  await assert.rejects(
    () =>
      resolveMetaPageRuntimeCredentialForFacebook(
        fakeRepository({ bindings: [binding(), binding({ id: "binding-2" })] }),
        { tenantId: TENANT, channelConnectionId: CONNECTION }
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialRuntimeResolverError &&
      err.diagnosticCode === "ambiguous_binding"
  );
});

test("resolveMetaPageRuntimeCredentialForFacebook fails closed when active credential missing", async () => {
  await assert.rejects(
    () =>
      resolveMetaPageRuntimeCredentialForFacebook(
        fakeRepository({ bindings: [binding()], active: null }),
        { tenantId: TENANT, channelConnectionId: CONNECTION }
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialRuntimeResolverError &&
      err.diagnosticCode === "credential_state_invalid"
  );
});

test("resolveMetaPageRuntimeCredentialForFacebook fails closed on decrypt error", async () => {
  const activeBinding = binding();
  await assert.rejects(
    () =>
      resolveMetaPageRuntimeCredentialForFacebook(
        fakeRepository({
          bindings: [activeBinding],
          active: { credential: credential(), binding: activeBinding },
          decryptThrows: true
        }),
        { tenantId: TENANT, channelConnectionId: CONNECTION }
      ),
    (err: unknown) =>
      err instanceof MetaPageCredentialRuntimeResolverError &&
      err.diagnosticCode === "credential_decrypt_failed"
  );
});

test("toMetaPageRuntimeResolverLogPayload excludes token material", () => {
  const payload = toMetaPageRuntimeResolverLogPayload({
    tenantId: TENANT,
    channelConnectionId: CONNECTION,
    credentialId: CREDENTIAL_ID,
    credentialVersion: 1,
    facebookPageId: "541812345678901"
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(PAGE_TOKEN), false);
  assert.equal(serialized.includes("EAA"), false);
  assert.equal(payload.facebookPageIdPrefix, "5418");
  assert.equal(payload.facebookPageIdLength, 15);
});

test("MetaPageCredentialRuntimeResolverError does not echo token material", async () => {
  try {
    await resolveMetaPageRuntimeCredentialForFacebook(
      fakeRepository({ bindings: [binding({ bindingStatus: "ERROR" })] }),
      { tenantId: TENANT, channelConnectionId: CONNECTION }
    );
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof MetaPageCredentialRuntimeResolverError);
    assert.equal((err as Error).message.includes(PAGE_TOKEN), false);
    assert.equal((err as Error).message.includes("EAA"), false);
  }
});
