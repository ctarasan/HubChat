import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_GRAPH_HOST,
  INSTAGRAM_OAUTH_AUTHORIZE_HOST,
  INSTAGRAM_OAUTH_TOKEN_HOST,
  buildInstagramOAuthAuthorizeUrl,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedAccessToken
} from "./instagramBusinessLoginOAuth.js";

const config = {
  appId: "app-123",
  appSecret: "secret-456",
  graphVersion: "v25.0",
  callbackUrl: "https://example.test/api/channel-connect/instagram/oauth/callback"
};

test("buildInstagramOAuthAuthorizeUrl uses fixed Instagram host and approved params", () => {
  const url = new URL(
    buildInstagramOAuthAuthorizeUrl({
      config,
      state: "opaque-state-value",
      scopes: ["instagram_business_basic", "instagram_business_manage_messages"]
    })
  );
  assert.equal(url.origin, INSTAGRAM_OAUTH_AUTHORIZE_HOST);
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "app-123");
  assert.equal(url.searchParams.get("redirect_uri"), config.callbackUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "opaque-state-value");
  assert.equal(
    url.searchParams.get("scope"),
    "instagram_business_basic,instagram_business_manage_messages"
  );
});

test("exchangeInstagramAuthorizationCode posts form-urlencoded to official token endpoint", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        access_token: "short-token",
        user_id: 12345,
        permissions: ["instagram_business_basic"]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await exchangeInstagramAuthorizationCode(
    { ...config, fetchImpl },
    "auth-code-value"
  );

  assert.equal(capturedUrl, `${INSTAGRAM_OAUTH_TOKEN_HOST}/oauth/access_token`);
  assert.equal(capturedInit?.method, "POST");
  assert.equal(
    (capturedInit?.headers as Record<string, string>)["Content-Type"],
    "application/x-www-form-urlencoded"
  );
  const body = String(capturedInit?.body);
  assert.match(body, /client_id=app-123/);
  assert.match(body, /client_secret=secret-456/);
  assert.match(body, /grant_type=authorization_code/);
  assert.match(body, /redirect_uri=/);
  assert.match(body, /code=auth-code-value/);
  assert.equal(result.accessToken, "short-token");
  assert.equal(result.providerUserId, "12345");
});

test("exchangeInstagramLongLivedAccessToken uses graph ig_exchange_token grant", async () => {
  let capturedUrl = "";
  const fetchImpl = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify({ access_token: "long-token", expires_in: 5184000 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const result = await exchangeInstagramLongLivedAccessToken(
    { ...config, fetchImpl },
    "short-token"
  );
  const url = new URL(capturedUrl);
  assert.equal(url.origin, INSTAGRAM_GRAPH_HOST);
  assert.equal(url.searchParams.get("grant_type"), "ig_exchange_token");
  assert.equal(url.searchParams.get("client_secret"), "secret-456");
  assert.equal(url.searchParams.get("access_token"), "short-token");
  assert.equal(result.accessToken, "long-token");
  assert.equal(result.expiresInSeconds, 5184000);
});

test("provider client maps 4xx to exchange failed without retry", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error_message: "invalid code" }), { status: 400 });
  }) as typeof fetch;
  await assert.rejects(
    () => exchangeInstagramAuthorizationCode({ ...config, fetchImpl }, "bad-code"),
    /Token exchange|Provider|invalid/i
  );
  assert.equal(calls, 1);
});

test("provider client enforces timeout", async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }) as typeof fetch;
  await assert.rejects(
    () =>
      exchangeInstagramAuthorizationCode(
        { ...config, fetchImpl, requestTimeoutMs: 5 },
        "code"
      ),
    /timed out/i
  );
});
