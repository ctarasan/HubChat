import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseMetaPageCredentialActivationRepository } from "./supabaseMetaPageCredentialActivationRepository.js";
import { MetaPageCredentialActivationError } from "../../../domain/metaPageCredentialActivationErrors.js";
import {
  createVerifiedMetaPageCredentialProof,
  VERIFIED_META_PAGE_PROOF_FACTORY
} from "../../../application/metaPageCredentialVerification/verifiedMetaPageCredentialProofFactory.js";
import { buildMetaPageCredentialActivationRequestFingerprint } from "../../../lib/metaPageCredentialActivationFingerprint.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const FB_CONNECTION = "cc111111-1111-4111-8111-111111111111";
const CIPHERTEXT = "v1:iv:ciphertext:tag";

function buildProof(requestedChannels: ("FACEBOOK" | "INSTAGRAM")[]) {
  return createVerifiedMetaPageCredentialProof(VERIFIED_META_PAGE_PROOF_FACTORY, {
    accessToken: "EAAfake-page-access-token-placeholder-for-unit-tests-only",
    metadata: {
      credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
      providerAppId: "1234567890",
      facebookPageId: "9876543210",
      instagramProfessionalAccountId: requestedChannels.includes("INSTAGRAM")
        ? "17841400000000001"
        : null,
      requestedChannels,
      grantedScopes: [
        "pages_messaging",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_messages"
      ],
      tokenExpiresAt: "2035-01-01T00:00:00.000Z",
      dataAccessExpiresAt: "2035-01-01T00:00:00.000Z",
      providerTokenType: "PAGE",
      verificationVersion: 1,
      verifiedAt: "2035-01-01T00:00:00.000Z",
      tokenFingerprint: "abc123fingerprint"
    }
  });
}

function buildRepo(rpcImpl: (name: string, input: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  return new SupabaseMetaPageCredentialActivationRepository({ rpc: rpcImpl } as never);
}

test("activation adapter issues exactly one RPC call with ciphertext only", async () => {
  let calls = 0;
  let rpcName = "";
  let rpcInput: Record<string, unknown> = {};
  const proof = buildProof(["FACEBOOK"]);
  const repo = buildRepo(async (name, input) => {
    calls += 1;
    rpcName = name;
    rpcInput = input;
    return {
      data: {
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
      },
      error: null
    };
  });

  const fingerprint = buildMetaPageCredentialActivationRequestFingerprint({
    tenantId: TENANT,
    facebookConnectionId: FB_CONNECTION,
    requestedChannels: ["FACEBOOK"],
    expectedCredentialVersion: 0,
    tokenFingerprint: proof.metadata.tokenFingerprint
  });

  const result = await repo.activate({
    tenantId: TENANT,
    proof,
    encryptedAccessTokenCiphertext: CIPHERTEXT,
    facebookConnectionId: FB_CONNECTION,
    expectedCredentialVersion: 0,
    idempotencyKey: "idem-1",
    requestFingerprint: fingerprint
  });

  assert.equal(calls, 1);
  assert.equal(rpcName, "activate_meta_page_credential_tx");
  assert.equal(rpcInput.p_encrypted_access_token, CIPHERTEXT);
  assert.equal(rpcInput.p_token_fingerprint, proof.metadata.tokenFingerprint);
  assert.equal(result.activationStatus, "ACTIVATED_PENDING_HEALTH");
  assert.equal(result.idempotencyReplay, false);
  assert.equal(JSON.stringify(result).includes(CIPHERTEXT), false);
});

test("activation adapter maps version conflict from RPC message", async () => {
  const repo = buildRepo(async () => ({
    data: null,
    error: { message: "META_CREDENTIAL_VERSION_CONFLICT" }
  }));
  const proof = buildProof(["FACEBOOK"]);
  await assert.rejects(
    () =>
      repo.activate({
        tenantId: TENANT,
        proof,
        encryptedAccessTokenCiphertext: CIPHERTEXT,
        facebookConnectionId: FB_CONNECTION,
        expectedCredentialVersion: 1,
        credentialId: "cred-existing",
        idempotencyKey: "idem-2",
        requestFingerprint: "fp-2"
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialActivationError &&
      err.code === "META_CREDENTIAL_VERSION_CONFLICT"
  );
});

test("activation adapter maps activation conflict", async () => {
  const repo = buildRepo(async () => ({
    data: null,
    error: { message: "META_ACTIVATION_CONFLICT" }
  }));
  const proof = buildProof(["FACEBOOK"]);
  await assert.rejects(
    () =>
      repo.activate({
        tenantId: TENANT,
        proof,
        encryptedAccessTokenCiphertext: CIPHERTEXT,
        facebookConnectionId: FB_CONNECTION,
        expectedCredentialVersion: 0,
        idempotencyKey: "idem-3",
        requestFingerprint: "fp-3"
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialActivationError && err.code === "META_ACTIVATION_CONFLICT"
  );
});

test("activation adapter replays idempotent success payload", async () => {
  const repo = buildRepo(async () => ({
    data: {
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
      idempotencyReplay: true
    },
    error: null
  }));
  const proof = buildProof(["FACEBOOK"]);
  const result = await repo.activate({
    tenantId: TENANT,
    proof,
    encryptedAccessTokenCiphertext: CIPHERTEXT,
    facebookConnectionId: FB_CONNECTION,
    expectedCredentialVersion: 0,
    idempotencyKey: "idem-4",
    requestFingerprint: "fp-4"
  });
  assert.equal(result.idempotencyReplay, true);
});

test("activation adapter rejects missing Instagram connection for dual-channel proof", async () => {
  const repo = buildRepo(async () => ({ data: {}, error: null }));
  const proof = buildProof(["FACEBOOK", "INSTAGRAM"]);
  await assert.rejects(
    () =>
      repo.activate({
        tenantId: TENANT,
        proof,
        encryptedAccessTokenCiphertext: CIPHERTEXT,
        facebookConnectionId: FB_CONNECTION,
        expectedCredentialVersion: 0,
        idempotencyKey: "idem-5",
        requestFingerprint: "fp-5"
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialActivationError &&
      err.code === "META_ACTIVATION_INPUT_INVALID"
  );
});

test("activation adapter sanitizes unknown Supabase errors", async () => {
  const repo = buildRepo(async () => ({
    data: null,
    error: { message: "syntax error at or near SELECT from secret_table token=EAAXX" }
  }));
  const proof = buildProof(["FACEBOOK"]);
  await assert.rejects(
    () =>
      repo.activate({
        tenantId: TENANT,
        proof,
        encryptedAccessTokenCiphertext: CIPHERTEXT,
        facebookConnectionId: FB_CONNECTION,
        expectedCredentialVersion: 0,
        idempotencyKey: "idem-6",
        requestFingerprint: "fp-6"
      }),
    (err: unknown) => {
      if (!(err instanceof MetaPageCredentialActivationError)) return false;
      assert.equal(err.code, "META_PROVIDER_UNAVAILABLE");
      assert.equal(err.message.includes("EAAXX"), false);
      return true;
    }
  );
});
