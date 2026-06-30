import test from "node:test";
import assert from "node:assert/strict";
import { VerifyMetaPageCredentialUseCase } from "./verifyMetaPageCredential.js";
import { GraphMetaPageTokenInspector } from "../../infrastructure/adapters/meta/metaPageTokenInspector.js";
import { GraphMetaPageIdentityVerifier } from "../../infrastructure/adapters/meta/metaPageIdentityVerifier.js";
import { GraphMetaInstagramRelationshipVerifier } from "../../infrastructure/adapters/meta/metaInstagramRelationshipVerifier.js";
import { MetaGraphHttpClient } from "../../infrastructure/adapters/meta/metaGraphHttpClient.js";
import { buildMetaAppAccessToken } from "../../lib/metaPageCredentialProviderConfig.js";
import { MetaPageCredentialVerificationError } from "../../domain/metaPageCredentialVerificationErrors.js";
import {
  assertProofJsonExcludesSecrets,
  toVerifiedMetaPageCredentialProofPublicDto
} from "../../lib/metaPageCredentialVerificationSerialization.js";
import {
  createVerifiedMetaPageCredentialProof,
  VERIFIED_META_PAGE_PROOF_FACTORY
} from "./verifiedMetaPageCredentialProofFactory.js";

const TENANT = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";
const OTHER_TENANT = "da92d847-53cd-4b60-9e4d-5fd3f8ad8650";
const APP_ID = "1234567890";
const APP_SECRET = "test-app-secret-placeholder";
const PAGE_ID = "9876543210";
const IG_ID = "17841400000000001";
const PAGE_TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";

function buildUseCase(fetchImpl: typeof fetch): VerifyMetaPageCredentialUseCase {
  const http = new MetaGraphHttpClient({ fetchImpl });
  return new VerifyMetaPageCredentialUseCase({
    tokenInspector: new GraphMetaPageTokenInspector({ graphVersion: "v25.0", httpClient: http }),
    pageIdentityVerifier: new GraphMetaPageIdentityVerifier({ graphVersion: "v25.0", httpClient: http }),
    instagramRelationshipVerifier: new GraphMetaInstagramRelationshipVerifier({
      graphVersion: "v25.0",
      httpClient: http
    }),
    appSecret: APP_SECRET,
    resolveAppAccessToken: ({ appId, appSecret }) => buildMetaAppAccessToken(appId, appSecret),
    now: () => new Date("2035-06-01T00:00:00.000Z")
  });
}

function routeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) return handler();
    }
    return new Response(JSON.stringify({ error: { message: "unexpected url" } }), { status: 404 });
  }) as typeof fetch;
}

const baseFacebookConnection = {
  tenantId: TENANT,
  connectionId: "cc-fb-1",
  provider: "FACEBOOK" as const,
  providerAccountId: PAGE_ID
};

const baseInstagramConnection = {
  tenantId: TENANT,
  connectionId: "cc-ig-1",
  provider: "INSTAGRAM" as const,
  providerAccountId: IG_ID
};

test("Facebook-only verification returns proof without Instagram account", async () => {
  const useCase = buildUseCase(
    routeFetch({
      debug_token: () =>
        new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: [
                "pages_messaging",
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_metadata"
              ]
            }
          }),
          { status: 200 }
        ),
      [encodeURIComponent(PAGE_ID)]: () =>
        new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 })
    })
  );

  const proof = await useCase.execute({
    tenantId: TENANT,
    accessToken: PAGE_TOKEN,
    requestedChannels: ["FACEBOOK"],
    expectedAppId: APP_ID,
    facebookConnection: baseFacebookConnection
  });

  assert.equal(proof.metadata.credentialFamily, "META_PAGE_FACEBOOK_LOGIN");
  assert.equal(proof.metadata.instagramProfessionalAccountId, null);
  assertProofJsonExcludesSecrets(proof);
  const dto = toVerifiedMetaPageCredentialProofPublicDto(proof);
  assert.equal(dto.facebookPageId, PAGE_ID);
});

test("dual-channel verification includes Instagram account", async () => {
  const useCase = buildUseCase(
    routeFetch({
      debug_token: () =>
        new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: [
                "pages_messaging",
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_metadata",
                "instagram_basic",
                "instagram_manage_messages"
              ]
            }
          }),
          { status: 200 }
        ),
      [encodeURIComponent(PAGE_ID)]: () =>
        new Response(
          JSON.stringify({
            id: PAGE_ID,
            instagram_business_account: { id: IG_ID, username: "testuser" }
          }),
          { status: 200 }
        )
    })
  );

  const proof = await useCase.execute({
    tenantId: TENANT,
    accessToken: PAGE_TOKEN,
    requestedChannels: ["FACEBOOK", "INSTAGRAM"],
    expectedAppId: APP_ID,
    facebookConnection: baseFacebookConnection,
    instagramConnection: baseInstagramConnection
  });
  assert.equal(proof.metadata.instagramProfessionalAccountId, IG_ID);
});

test("dual-channel Instagram failure does not return proof", async () => {
  const useCase = buildUseCase(
    routeFetch({
      debug_token: () =>
        new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: [
                "pages_messaging",
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_metadata",
                "instagram_basic",
                "instagram_manage_messages"
              ]
            }
          }),
          { status: 200 }
        ),
      [encodeURIComponent(PAGE_ID)]: () =>
        new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 })
    })
  );

  await assert.rejects(
    () =>
      useCase.execute({
        tenantId: TENANT,
        accessToken: PAGE_TOKEN,
        requestedChannels: ["FACEBOOK", "INSTAGRAM"],
        expectedAppId: APP_ID,
        facebookConnection: baseFacebookConnection,
        instagramConnection: baseInstagramConnection
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_IG_ACCOUNT_NOT_FOUND"
  );
});

test("cross-tenant Facebook connection rejected", async () => {
  const useCase = buildUseCase(routeFetch({}));
  await assert.rejects(
    () =>
      useCase.execute({
        tenantId: TENANT,
        accessToken: PAGE_TOKEN,
        requestedChannels: ["FACEBOOK"],
        expectedAppId: APP_ID,
        facebookConnection: { ...baseFacebookConnection, tenantId: OTHER_TENANT }
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_CONNECTION_NOT_FOUND"
  );
});

test("Instagram requested without connection rejected", async () => {
  const useCase = buildUseCase(routeFetch({}));
  await assert.rejects(
    () =>
      useCase.execute({
        tenantId: TENANT,
        accessToken: PAGE_TOKEN,
        requestedChannels: ["FACEBOOK", "INSTAGRAM"],
        expectedAppId: APP_ID,
        facebookConnection: baseFacebookConnection
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_ACTIVATION_INPUT_INVALID"
  );
});

test("proof factory rejects external construction", () => {
  assert.throws(() =>
    createVerifiedMetaPageCredentialProof(Symbol("fake"), {
      accessToken: PAGE_TOKEN,
      metadata: {
        credentialFamily: "META_PAGE_FACEBOOK_LOGIN",
        providerAppId: APP_ID,
        facebookPageId: PAGE_ID,
        instagramProfessionalAccountId: null,
        requestedChannels: ["FACEBOOK"],
        grantedScopes: ["pages_messaging"],
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        providerTokenType: "PAGE",
        verificationVersion: 1,
        verifiedAt: new Date().toISOString(),
        tokenFingerprint: "abc"
      }
    })
  );
});

test("proof consumeAccessToken provides token only through callback", async () => {
  const useCase = buildUseCase(
    routeFetch({
      debug_token: () =>
        new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: [
                "pages_messaging",
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_metadata"
              ]
            }
          }),
          { status: 200 }
        ),
      [encodeURIComponent(PAGE_ID)]: () =>
        new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 })
    })
  );

  const proof = await useCase.execute({
    tenantId: TENANT,
    accessToken: PAGE_TOKEN,
    requestedChannels: ["FACEBOOK"],
    expectedAppId: APP_ID,
    facebookConnection: baseFacebookConnection
  });

  const seen = proof.consumeAccessToken((token) => token.length > 0);
  assert.equal(seen, true);
  assert.equal(JSON.stringify(proof.metadata).includes(PAGE_TOKEN), false);
});

test("error serialization excludes secrets", () => {
  const err = new MetaPageCredentialVerificationError(
    "META_TOKEN_INVALID",
    "Meta Page access token is not valid",
    false
  );
  const json = JSON.stringify(err.toPublicJson());
  assert.equal(json.includes("EAA"), false);
  assert.equal(json.includes("secret"), false);
});

test("verification calls debug_token before Page identity and Page identity uses fields=id", async () => {
  const callOrder: string[] = [];
  const useCase = buildUseCase(
    (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("debug_token")) callOrder.push("debug_token");
      if (url.includes(encodeURIComponent(PAGE_ID))) {
        callOrder.push("page_identity");
        assert.match(url, /fields=id(?:&|$)/);
        assert.equal(url.includes("tasks"), false);
      }
      if (url.includes("debug_token")) {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: [
                "pages_messaging",
                "pages_show_list",
                "pages_read_engagement",
                "pages_manage_metadata"
              ]
            }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 });
    }) as typeof fetch
  );

  await useCase.execute({
    tenantId: TENANT,
    accessToken: PAGE_TOKEN,
    requestedChannels: ["FACEBOOK"],
    expectedAppId: APP_ID,
    facebookConnection: baseFacebookConnection
  });
  assert.deepEqual(callOrder, ["debug_token", "page_identity"]);
});

test("missing granted scopes fails before Page identity call", async () => {
  let pageCalled = false;
  const useCase = buildUseCase(
    (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(encodeURIComponent(PAGE_ID))) pageCalled = true;
      if (url.includes("debug_token")) {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              type: "PAGE",
              app_id: APP_ID,
              expires_at: 4_000_000_000,
              scopes: ["pages_show_list"]
            }
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 });
    }) as typeof fetch
  );

  await assert.rejects(
    () =>
      useCase.execute({
        tenantId: TENANT,
        accessToken: PAGE_TOKEN,
        requestedChannels: ["FACEBOOK"],
        expectedAppId: APP_ID,
        facebookConnection: baseFacebookConnection
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_SCOPE_MISSING"
  );
  assert.equal(pageCalled, false);
});
