import test from "node:test";
import assert from "node:assert/strict";
import { GraphMetaPageTokenInspector } from "./metaPageTokenInspector.js";
import { MetaGraphHttpClient } from "./metaGraphHttpClient.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";

const APP_ID = "1234567890";
const APP_SECRET = "test-app-secret-placeholder";
const PAGE_TOKEN = "EAAfake-page-access-token-placeholder-for-unit-tests-only";
const IGA_TOKEN = "IGARVfake-instagram-login-token-placeholder";

function mockFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as typeof fetch;
}

function debugTokenResponse(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

test("valid Meta Page token inspection succeeds", async () => {
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch((url) => {
        assert.match(url, /debug_token/);
        return debugTokenResponse({
          is_valid: true,
          type: "PAGE",
          app_id: APP_ID,
          expires_at: 4_000_000_000,
          data_access_expires_at: 4_000_000_100,
          scopes: ["pages_messaging", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"]
        });
      })
    })
  });

  const result = await inspector.inspect({
    accessToken: PAGE_TOKEN,
    expectedAppId: APP_ID,
    appAccessToken: `${APP_ID}|${APP_SECRET}`
  });
  assert.equal(result.providerTokenType, "PAGE");
  assert.equal(result.providerAppId, APP_ID);
  assert.ok(result.grantedScopes.includes("pages_messaging"));
});

test("IGA token rejected before provider call", async () => {
  const inspector = new GraphMetaPageTokenInspector({ graphVersion: "v25.0" });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: IGA_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_TOKEN_FAMILY_MISMATCH"
  );
});

test("non-IGA incompatible token rejected by provider type", async () => {
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() =>
        debugTokenResponse({
          is_valid: true,
          type: "USER",
          app_id: APP_ID,
          expires_at: 4_000_000_000
        })
      )
    })
  });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: PAGE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_TOKEN_FAMILY_MISMATCH"
  );
});

test("app mismatch rejected", async () => {
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() =>
        debugTokenResponse({
          is_valid: true,
          type: "PAGE",
          app_id: "9999999999",
          expires_at: 4_000_000_000
        })
      )
    })
  });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: PAGE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_APP_MISMATCH"
  );
});

test("expired token rejected", async () => {
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() =>
        debugTokenResponse({
          is_valid: true,
          type: "PAGE",
          app_id: APP_ID,
          expires_at: 1
        })
      )
    })
  });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: PAGE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError && err.code === "META_TOKEN_EXPIRED"
  );
});

test("malformed provider response rejected", async () => {
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      fetchImpl: mockFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    })
  });
  await assert.rejects(
    () =>
      inspector.inspect({
        accessToken: PAGE_TOKEN,
        expectedAppId: APP_ID,
        appAccessToken: `${APP_ID}|${APP_SECRET}`
      }),
    (err: unknown) =>
      err instanceof MetaPageCredentialVerificationError &&
      err.code === "META_DEBUG_TOKEN_MISSING_DATA" &&
      err.providerDiagnostic?.providerSubstage === "DEBUG_TOKEN_PARSE"
  );
});

test("transient provider failure retries then succeeds", async () => {
  let calls = 0;
  const inspector = new GraphMetaPageTokenInspector({
    graphVersion: "v25.0",
    httpClient: new MetaGraphHttpClient({
      maxRetries: 2,
      fetchImpl: mockFetch(() => {
        calls += 1;
        if (calls === 1) {
          return new Response("error", { status: 503 });
        }
        return debugTokenResponse({
          is_valid: true,
          type: "PAGE",
          app_id: APP_ID,
          expires_at: 4_000_000_000,
          scopes: ["pages_messaging", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"]
        });
      })
    })
  });
  const result = await inspector.inspect({
    accessToken: PAGE_TOKEN,
    expectedAppId: APP_ID,
    appAccessToken: `${APP_ID}|${APP_SECRET}`
  });
  assert.equal(result.isValid, true);
  assert.ok(calls >= 2);
});
