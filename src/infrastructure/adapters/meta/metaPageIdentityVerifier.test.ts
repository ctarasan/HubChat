import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMetaPageIdentityGraphUrl,
  GraphMetaPageIdentityVerifier,
  META_PAGE_IDENTITY_GRAPH_FIELDS
} from "./metaPageIdentityVerifier.js";
import { GraphMetaInstagramRelationshipVerifier } from "./metaInstagramRelationshipVerifier.js";
import { MetaGraphHttpClient } from "./metaGraphHttpClient.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";

const PAGE_ID = "9876543210";
const IG_ID = "17841400000000001";
const TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";
const FAKE_TOKEN = "TEST_FAKE_TOKEN_MUST_NOT_LOG";
const RAW_BODY_MARKER = "TEST_RAW_META_BODY_MUST_NOT_LOG";

function mockFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as typeof fetch;
}

test("buildMetaPageIdentityGraphUrl requests fields=id only", () => {
  const url = buildMetaPageIdentityGraphUrl("v25.0", PAGE_ID);
  assert.equal(url.searchParams.get("fields"), "id");
  assert.equal(url.pathname, `/v25.0/${PAGE_ID}`);
  assert.equal(url.searchParams.has("tasks"), false);
  assert.match(String(url), /fields=id(?:&|$)/);
  assert.equal(String(url).includes("fields=id,tasks"), false);
});

test("Page identity verifier issues GET with fields=id and no tasks in URL", async () => {
  let capturedUrl = "";
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch((url) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 });
      })
    })
  });

  await verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID });
  assert.match(capturedUrl, /graph\.facebook\.com\/v25\.0\//);
  assert.match(capturedUrl, /fields=id(?:&|$)/);
  assert.equal(capturedUrl.includes("tasks"), false);
  assert.equal(capturedUrl.includes(FAKE_TOKEN), false);
});

test("Page identity verifier matches expected Page with id-only response", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 }))
    })
  });
  const result = await verifier.verifyPage({
    accessToken: TOKEN,
    expectedFacebookPageId: PAGE_ID
  });
  assert.equal(result.facebookPageId, PAGE_ID);
  assert.deepEqual(result.pageTasks, []);
});

test("Page identity mismatch rejected", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(JSON.stringify({ id: "1111111111" }), { status: 200 }))
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_MISMATCH" &&
      err.providerDiagnostic?.providerSubstage === "PAGE_IDENTITY_MATCH"
  );
});

test("inaccessible Page rejected when id missing", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_NOT_ACCESSIBLE"
  );
});

test("Page identity HTTP 4xx remains safely classified", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() =>
        new Response(JSON.stringify({ error: { message: RAW_BODY_MARKER, code: 100 } }), { status: 400 })
      )
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) => {
      if (!(err instanceof MetaPageCredentialVerificationError)) return false;
      const json = JSON.stringify(err.providerDiagnostic ?? {});
      return (
        err.code === "META_PAGE_IDENTITY_HTTP_REJECTED" &&
        err.providerDiagnostic?.providerSubstage === "PAGE_IDENTITY_REQUEST" &&
        err.providerDiagnostic?.providerHttpStatusCategory === "4XX" &&
        json.includes(FAKE_TOKEN) === false &&
        json.includes(RAW_BODY_MARKER) === false
      );
    }
  );
});

test("Page identity error-shaped HTTP 200 remains rejected", async () => {
  const verifier = new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() =>
        new Response(JSON.stringify({ error: { message: RAW_BODY_MARKER, code: 100 } }), { status: 200 })
      )
    })
  });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_UNEXPECTED_SHAPE"
  );
});

test("META_PAGE_IDENTITY_GRAPH_FIELDS is id only", () => {
  assert.equal(META_PAGE_IDENTITY_GRAPH_FIELDS, "id");
  assert.equal(META_PAGE_IDENTITY_GRAPH_FIELDS.includes("tasks"), false);
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
