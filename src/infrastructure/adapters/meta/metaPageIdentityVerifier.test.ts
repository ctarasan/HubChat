import test from "node:test";
import assert from "node:assert/strict";
import { GraphMetaPageIdentityVerifier } from "./metaPageIdentityVerifier.js";
import { GraphMetaInstagramRelationshipVerifier } from "./metaInstagramRelationshipVerifier.js";
import { MetaGraphHttpClient } from "./metaGraphHttpClient.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";

const PAGE_ID = "9876543210";
const IG_ID = "17841400000000001";
const TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";

test("Page identity verifier matches expected Page", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ id: PAGE_ID, tasks: ["MESSAGING"] }), { status: 200 })
    })
  });
  const result = await verifier.verifyPage({
    accessToken: TOKEN,
    expectedFacebookPageId: PAGE_ID
  });
  assert.equal(result.facebookPageId, PAGE_ID);
});

test("Page identity mismatch rejected", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ id: "1111111111", tasks: ["MESSAGING"] }), { status: 200 })
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_MISMATCH"
  );
});

test("inaccessible Page rejected", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 })
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_NOT_ACCESSIBLE"
  );
});

test("missing required Page task rejected", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ id: PAGE_ID, tasks: ["ANALYZE"] }), { status: 200 })
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_SCOPE_MISSING"
  );
});

test("Instagram relationship verifier matches expected account", async () => {
  const verifier = new GraphMetaInstagramRelationshipVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ instagram_business_account: { id: IG_ID, username: "shop" } }),
          { status: 200 }
        )
    })
  });
  const result = await verifier.verifyRelationship({
    accessToken: TOKEN,
    facebookPageId: PAGE_ID,
    expectedInstagramAccountId: IG_ID
  });
  assert.equal(result.instagramProfessionalAccountId, IG_ID);
});

test("Instagram relationship wrong account rejected", async () => {
  const verifier = new GraphMetaInstagramRelationshipVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ instagram_business_account: { id: "9999999999", username: "other" } }),
          { status: 200 }
        )
    })
  });
  await assert.rejects(
    () =>
      verifier.verifyRelationship({
        accessToken: TOKEN,
        facebookPageId: PAGE_ID,
        expectedInstagramAccountId: IG_ID
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_IG_IDENTITY_MISMATCH"
  );
});

test("Instagram account not found on Page rejected", async () => {
  const verifier = new GraphMetaInstagramRelationshipVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: async () => new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 })
    })
  });
  await assert.rejects(
    () =>
      verifier.verifyRelationship({
        accessToken: TOKEN,
        facebookPageId: PAGE_ID,
        expectedInstagramAccountId: IG_ID
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_IG_ACCOUNT_NOT_FOUND"
  );
});
