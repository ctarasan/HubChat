import test from "node:test";
import assert from "node:assert/strict";
import { GraphMetaPageTokenInspector } from "./metaPageTokenInspector.js";
import { GraphMetaPageIdentityVerifier } from "./metaPageIdentityVerifier.js";
import { MetaGraphHttpClient } from "./metaGraphHttpClient.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import {
  buildMetaPageCredentialActivationFailureLogEvent,
  buildPublicActivationErrorJson
} from "../../../lib/metaPageCredentialActivationDiagnostics.js";
import { mapMetaPageCredentialActivationFailure } from "../../../lib/metaPageCredentialActivationApiErrors.js";
import { assertProviderVerificationDiagnosticSafe } from "../../../lib/metaProviderVerificationDiagnostics.js";

const APP_ID = "1234567890";
const APP_SECRET = "test-app-secret-placeholder";
const PAGE_ID = "9876543210";
const FAKE_TOKEN = "TEST_FAKE_TOKEN_MUST_NOT_LOG";
const RAW_BODY_MARKER = "TEST_RAW_META_BODY_MUST_NOT_LOG";
const AUTH_HEADER_MARKER = "TEST_AUTHORIZATION_HEADER_MUST_NOT_LOG";

function mockFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as typeof fetch;
}

function inspectorWithResponse(body: unknown, status = 200): GraphMetaPageTokenInspector {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(payload, { status, headers: { "content-type": "application/json" } }))
    })
  });
}

function pageVerifierWithResponse(body: unknown, status = 200): GraphMetaPageIdentityVerifier {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new GraphMetaPageIdentityVerifier({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(payload, { status, headers: { "content-type": "application/json" } }))
    })
  });
}

async function assertDebugTokenFailure(
  body: unknown,
  expected: {
    code: string;
    substage: string;
    shape: string;
    httpCategory: string;
    hasData?: boolean;
    hasError?: boolean;
  },
  status = 200
): Promise<void> {
  const inspector = inspectorWithResponse(body, status);
  const correlationId = "corr-debug-token-fixture";
  try {
    await inspector.inspect({
      accessToken: FAKE_TOKEN,
      expectedAppId: APP_ID,
      appAccessToken: `${APP_ID}|${APP_SECRET}`
    });
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(error instanceof MetaPageCredentialVerificationError);
    assert.equal(error.code, expected.code);
    assert.ok(error.providerDiagnostic);
    assert.equal(error.providerDiagnostic?.providerOperation, "DEBUG_TOKEN");
    assert.equal(error.providerDiagnostic?.providerSubstage, expected.substage);
    assert.equal(error.providerDiagnostic?.responseShapeCategory, expected.shape);
    assert.equal(error.providerDiagnostic?.providerHttpStatusCategory, expected.httpCategory);
    assert.equal(error.providerDiagnostic?.graphVersion, "v25.0");
    if (expected.hasData !== undefined) {
      assert.equal(error.providerDiagnostic?.hasData, expected.hasData);
    }
    if (expected.hasError !== undefined) {
      assert.equal(error.providerDiagnostic?.hasError, expected.hasError);
    }

    const mapped = mapMetaPageCredentialActivationFailure(error);
    const logEvent = buildMetaPageCredentialActivationFailureLogEvent({
      correlationId,
      stage: "PROVIDER_VERIFICATION",
      sanitizedCode: mapped.code,
      httpStatus: mapped.httpStatus,
      context: {},
      commitReached: false,
      rpcInvoked: false,
      providerDiagnostic: error.providerDiagnostic
    });
    const publicJson = buildPublicActivationErrorJson(mapped, correlationId);
    const serialized = JSON.stringify({ logEvent, publicJson, message: error.message });
    assert.equal(serialized.includes(FAKE_TOKEN), false);
    assert.equal(serialized.includes(RAW_BODY_MARKER), false);
    assert.equal(serialized.includes(AUTH_HEADER_MARKER), false);
    assert.equal(serialized.includes("input_token"), false);
    assert.equal(serialized.includes("access_token"), false);
    assert.equal(logEvent.rpcInvoked, false);
    assert.equal(logEvent.commitReached, false);
    assert.equal(logEvent.correlationId, correlationId);
    assertProviderVerificationDiagnosticSafe(error.providerDiagnostic);
  }
}

test("debug_token valid data wrapper succeeds", async () => {
  const inspector = inspectorWithResponse({
    data: {
      is_valid: true,
      type: "PAGE",
      app_id: APP_ID,
      expires_at: 4_000_000_000,
      scopes: ["pages_messaging", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"]
    }
  });
  const result = await inspector.inspect({
    accessToken: FAKE_TOKEN,
    expectedAppId: APP_ID,
    appAccessToken: `${APP_ID}|${APP_SECRET}`
  });
  assert.equal(result.providerAppId, APP_ID);
});

test("debug_token empty object maps to missing data", async () => {
  await assertDebugTokenFailure(
    {},
    {
      code: "META_DEBUG_TOKEN_MISSING_DATA",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "JSON_OBJECT",
      httpCategory: "2XX",
      hasData: false,
      hasError: false
    }
  );
});

test("debug_token data null maps to null data subcode", async () => {
  await assertDebugTokenFailure(
    { data: null },
    {
      code: "META_DEBUG_TOKEN_NULL_DATA",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "JSON_DATA_NULL",
      httpCategory: "2XX",
      hasData: false,
      hasError: false
    }
  );
});

test("debug_token error-shaped HTTP 200 maps to error-shaped success", async () => {
  await assertDebugTokenFailure(
    { error: { message: RAW_BODY_MARKER, code: 190, type: "OAuthException" } },
    {
      code: "META_DEBUG_TOKEN_ERROR_SHAPED_SUCCESS",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "JSON_ERROR_OBJECT",
      httpCategory: "2XX",
      hasData: false,
      hasError: true
    }
  );
});

test("debug_token non-JSON body maps to non-json subcode", async () => {
  await assertDebugTokenFailure(
    `not-json ${RAW_BODY_MARKER}`,
    {
      code: "META_DEBUG_TOKEN_NON_JSON_RESPONSE",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "NON_JSON",
      httpCategory: "2XX"
    }
  );
});

test("debug_token empty body maps to empty response", async () => {
  await assertDebugTokenFailure(
    "",
    {
      code: "META_DEBUG_TOKEN_EMPTY_RESPONSE",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "EMPTY_BODY",
      httpCategory: "2XX"
    }
  );
});

test("debug_token HTTP 400 maps to http rejected", async () => {
  await assertDebugTokenFailure(
    { error: { message: RAW_BODY_MARKER } },
    {
      code: "META_DEBUG_TOKEN_HTTP_REJECTED",
      substage: "DEBUG_TOKEN_REQUEST",
      shape: "JSON_ERROR_OBJECT",
      httpCategory: "4XX"
    },
    400
  );
});

test("debug_token HTTP 500 remains provider unavailable", async () => {
  const inspector = inspectorWithResponse("error", 500);
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: FAKE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PROVIDER_UNAVAILABLE" &&
      err.providerDiagnostic?.providerOperation === "DEBUG_TOKEN" &&
      err.providerDiagnostic?.providerSubstage === "DEBUG_TOKEN_REQUEST"
  );
});

test("debug_token oversized body maps to response too large", async () => {
  const oversized = JSON.stringify({ data: { padding: "x".repeat(128) } });
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      maxResponseBytes: 64,
      fetchImpl: mockFetch(() => new Response(oversized, { status: 200 }))
    })
  });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: FAKE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_DEBUG_TOKEN_RESPONSE_TOO_LARGE" &&
      err.providerDiagnostic?.responseShapeCategory === "OVERSIZED"
  );
});

test("debug_token array body maps to unexpected shape", async () => {
  await assertDebugTokenFailure(
    [{ data: { is_valid: true } }],
    {
      code: "META_DEBUG_TOKEN_UNEXPECTED_SHAPE",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "ARRAY",
      httpCategory: "2XX"
    }
  );
});

test("debug_token primitive JSON maps to unexpected shape", async () => {
  await assertDebugTokenFailure(
    "true",
    {
      code: "META_DEBUG_TOKEN_UNEXPECTED_SHAPE",
      substage: "DEBUG_TOKEN_PARSE",
      shape: "PRIMITIVE",
      httpCategory: "2XX"
    }
  );
});

test("page identity HTTP 400 is distinguishable from debug_token", async () => {
  const verifier = pageVerifierWithResponse({ error: { message: RAW_BODY_MARKER } }, 400);
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_HTTP_REJECTED" &&
      err.providerDiagnostic?.providerOperation === "PAGE_IDENTITY" &&
      err.providerDiagnostic?.providerSubstage === "PAGE_IDENTITY_REQUEST"
  );
});

test("page identity error-shaped HTTP 200 maps to unexpected shape", async () => {
  const verifier = pageVerifierWithResponse({ error: { message: RAW_BODY_MARKER } });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_UNEXPECTED_SHAPE" &&
      err.providerDiagnostic?.providerOperation === "PAGE_IDENTITY"
  );
});

test("page identity non-JSON maps to non-json subcode", async () => {
  const verifier = pageVerifierWithResponse(`not-json ${RAW_BODY_MARKER}`);
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_NON_JSON_RESPONSE"
  );
});

test("page identity mismatch keeps semantic code with match substage", async () => {
  const verifier = pageVerifierWithResponse({ id: "1111111111" });
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_IDENTITY_MISMATCH" &&
      err.providerDiagnostic?.providerSubstage === "PAGE_IDENTITY_MATCH"
  );
});

test("page identity inaccessible keeps semantic code not response-invalid", async () => {
  const verifier = pageVerifierWithResponse({});
  await assert.rejects(
    () => verifier.verifyPage({ accessToken: FAKE_TOKEN, expectedFacebookPageId: PAGE_ID }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_PAGE_NOT_ACCESSIBLE" &&
      err.providerDiagnostic?.safeProviderSubcode === "META_PAGE_NOT_ACCESSIBLE"
  );
});
