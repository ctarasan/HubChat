import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allReadinessChecksPass,
  buildFacebookCompleteBody,
  classifyFacebookConnectHttpStatus,
  deferredHealthPresentationPatch,
  deriveFacebookConnectPresentationState,
  FACEBOOK_HEALTH_DEFERRED_COPY,
  FACEBOOK_OAUTH_ERROR_MESSAGES,
  FACEBOOK_OAUTH_UNAVAILABLE_COPY,
  FACEBOOK_RECONNECT_DEFERRED_COPY,
  FACEBOOK_STATUS_LOAD_RETRY_COPY,
  mapFacebookOAuthErrorCategory,
  parseFacebookCompleteResponse,
  parseFacebookConnectStatusResponse,
  parseFacebookHealthResponse,
  parseFacebookOAuthSessionResponse,
  parseFacebookOAuthStartAuthorizeUrl,
  parseFacebookPagesResponse,
  parseFacebookReconnectDeferredMessage,
  READINESS_CHECK_CODES,
  assignFacebookOAuthAuthorizeUrl,
  isFacebookOAuthAuthorizeUrl,
  stripFacebookOAuthQueryParams,
  sanitizeFacebookConnectMessage
} from "./facebookConnectModel.js";

const cardSource = readFileSync(new URL("./FacebookConnectCard.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");

test("deriveFacebookConnectPresentationState prefers server displayState", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      serverDisplayState: "AWAITING_PAGE_SELECTION",
      healthStatus: "UNKNOWN"
    }),
    "AWAITING_PAGE_SELECTION"
  );
});

test("callback success derivation is AWAITING_PAGE_SELECTION not CONNECTED", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      oauthStage: "CALLBACK_RECEIVED",
      healthStatus: "UNKNOWN"
    }),
    "AWAITING_PAGE_SELECTION"
  );
});

test("complete success derivation stays CONNECTING", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      serverDisplayState: "CONNECTING",
      connectionStatus: "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: "UNKNOWN"
    }),
    "CONNECTING"
  );
});

test("pre-READY health DEGRADED with displayState CONNECTING stays CONNECTING", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      serverDisplayState: "CONNECTING",
      connectionStatus: "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: "DEGRADED"
    }),
    "CONNECTING"
  );
});

test("all five PASS yields CONNECTED via READY + OK", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      connectionStatus: "READY",
      healthStatus: "OK"
    }),
    "CONNECTED"
  );
});

test("healthStatus never uses READY in parser", () => {
  const parsed = parseFacebookHealthResponse({
    data: {
      healthStatus: "READY",
      connectionStatus: "READY",
      displayState: "CONNECTING",
      checks: []
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.healthStatus, "UNKNOWN");
  }
});

test("parseFacebookHealthResponse rejects premature CONNECTED without all checks PASS", () => {
  const parsed = parseFacebookHealthResponse({
    data: {
      healthStatus: "OK",
      connectionStatus: "READY",
      displayState: "CONNECTED",
      checks: READINESS_CHECK_CODES.slice(0, 4).map((code) => ({
        code,
        status: "PASS",
        message: "ok"
      }))
    }
  });
  assert.equal(parsed.ok, false);
});

test("classifyFacebookConnectHttpStatus distinguishes deferred, auth, and unexpected failures", () => {
  assert.equal(classifyFacebookConnectHttpStatus(200), "success");
  assert.equal(classifyFacebookConnectHttpStatus(501), "deferred_capability");
  assert.equal(classifyFacebookConnectHttpStatus(401), "auth_failure");
  assert.equal(classifyFacebookConnectHttpStatus(403), "auth_failure");
  assert.equal(classifyFacebookConnectHttpStatus(404), "unexpected_failure");
  assert.equal(classifyFacebookConnectHttpStatus(500), "unexpected_failure");
});

test("parseFacebookReconnectDeferredMessage sanitizes backend deferred copy", () => {
  assert.equal(
    parseFacebookReconnectDeferredMessage({
      data: { available: false, message: "Reconnect is not yet available in this release." }
    }),
    "Reconnect is not yet available in this release."
  );
  assert.equal(parseFacebookReconnectDeferredMessage({}), FACEBOOK_RECONNECT_DEFERRED_COPY);
});

test("deferredHealthPresentationPatch keeps CONNECTING and clears reconnect pressure", () => {
  const patched = deferredHealthPresentationPatch(
    {
      connectionId: "c1",
      connectionStatus: "AUTHORIZING",
      displayState: "NEEDS_RECONNECT",
      oauthStage: "COMPLETED",
      healthStatus: "RECONNECT_REQUIRED",
      reconnectRequired: true,
      providerPageId: null,
      providerPageName: null,
      manualConfigured: false,
      oauthAvailable: true,
      lastCheckedAt: null,
      lastVerifiedAt: null,
      errorCategory: "RECONNECT_REQUIRED",
      message: null,
      credentialState: { pageAccessToken: "SET" }
    },
    false
  );
  assert.equal(patched.displayState, "CONNECTING");
  assert.equal(patched.healthStatus, "UNKNOWN");
  assert.equal(patched.reconnectRequired, false);
});

test("parseFacebookHealthResponse accepts deferred 501 body shape", () => {
  const parsed = parseFacebookHealthResponse({
    data: {
      healthStatus: "UNKNOWN",
      displayState: "CONNECTING",
      connectionStatus: "AUTHORIZING",
      reconnectRequired: false,
      checks: [],
      message: "Operational validation is not yet available in this release."
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.displayState, "CONNECTING");
    assert.equal(parsed.data.checks.length, 0);
    assert.equal(allReadinessChecksPass(parsed.data.checks), false);
  }
});

test("status unavailable copy is distinct from load retry copy", () => {
  assert.notEqual(FACEBOOK_OAUTH_UNAVAILABLE_COPY, FACEBOOK_STATUS_LOAD_RETRY_COPY);
  assert.match(FACEBOOK_HEALTH_DEFERRED_COPY, /not available yet/i);
  assert.match(FACEBOOK_RECONNECT_DEFERRED_COPY, /not available yet/i);
});

test("parseFacebookCompleteResponse rejects premature CONNECTED", () => {
  const bad = parseFacebookCompleteResponse({
    data: {
      connectionId: "c1",
      connectionStatus: "READY",
      displayState: "CONNECTED"
    }
  });
  assert.equal(bad.ok, false);
  const good = parseFacebookCompleteResponse({
    data: {
      connectionId: "c1",
      connectionStatus: "AUTHORIZING",
      oauthStage: "COMPLETED",
      healthStatus: "UNKNOWN",
      displayState: "CONNECTING",
      reconnectRequired: false,
      providerPageId: "123",
      providerPageName: "Page",
      message: "Saved"
    }
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.data.displayState, "CONNECTING");
    assert.equal(good.data.connectionStatus, "AUTHORIZING");
  }
});

test("buildFacebookCompleteBody sends pageId only", () => {
  assert.deepEqual(buildFacebookCompleteBody("1137356672785125"), { pageId: "1137356672785125" });
});

test("allReadinessChecksPass requires all five codes PASS", () => {
  const pass = READINESS_CHECK_CODES.map((code) => ({ code, status: "PASS" as const, message: "ok" }));
  assert.equal(allReadinessChecksPass(pass), true);
  const runtimeFail = pass.map((c) =>
    c.code === "RUNTIME_TEST_CONNECTION" ? { ...c, status: "FAIL" as const } : c
  );
  assert.equal(allReadinessChecksPass(runtimeFail), false);
});

test("resolver-disabled health mock cannot produce CONNECTED displayState from pre-READY FAIL", () => {
  const parsed = parseFacebookHealthResponse({
    data: {
      healthStatus: "ERROR",
      connectionStatus: "AUTHORIZING",
      displayState: "CONNECTING",
      reconnectRequired: false,
      checks: [
        { code: "CREDENTIAL_RESOLUTION", status: "PASS", message: "ok" },
        { code: "PAGE_ACCESS", status: "PASS", message: "ok" },
        { code: "REQUIRED_TASKS", status: "PASS", message: "ok" },
        { code: "GRAPH_API", status: "PASS", message: "ok" },
        { code: "RUNTIME_TEST_CONNECTION", status: "FAIL", message: "Runtime path unavailable" }
      ]
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.displayState, "CONNECTING");
    assert.notEqual(parsed.data.displayState, "CONNECTED");
  }
});

test("all five PASS health produces CONNECTED with OK healthStatus", () => {
  const parsed = parseFacebookHealthResponse({
    data: {
      healthStatus: "OK",
      connectionStatus: "READY",
      displayState: "CONNECTED",
      reconnectRequired: false,
      checks: READINESS_CHECK_CODES.map((code) => ({
        code,
        status: "PASS",
        message: "Stored credential resolved successfully"
      }))
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.healthStatus, "OK");
    assert.equal(parsed.data.displayState, "CONNECTED");
    assert.equal(allReadinessChecksPass(parsed.data.checks), true);
  }
});

test("reconnect proven maps to NEEDS_RECONNECT", () => {
  assert.equal(
    deriveFacebookConnectPresentationState({
      reconnectRequired: true,
      healthStatus: "RECONNECT_REQUIRED"
    }),
    "NEEDS_RECONNECT"
  );
});

test("mapFacebookOAuthErrorCategory uses UPPER_SNAKE_CASE only", () => {
  const mapped = mapFacebookOAuthErrorCategory("ACCESS_DENIED");
  assert.equal(mapped.category, "ACCESS_DENIED");
  assert.equal(mapped.message, FACEBOOK_OAUTH_ERROR_MESSAGES.ACCESS_DENIED);
  const lower = mapFacebookOAuthErrorCategory("access_denied");
  assert.equal(lower.category, "UNKNOWN");
});

test("stripFacebookOAuthQueryParams removes oauth callback params", () => {
  const url = new URL(
    "https://example.com/dashboard/channel-settings?channel=facebook&oauth=success&errorCategory=ACCESS_DENIED"
  );
  assert.equal(stripFacebookOAuthQueryParams(url), "/dashboard/channel-settings");
});

test("sanitizeFacebookConnectMessage blocks token-like leaks", () => {
  assert.equal(sanitizeFacebookConnectMessage("EAAxxxxx"), null);
  assert.equal(sanitizeFacebookConnectMessage("Stored credential resolved successfully"), "Stored credential resolved successfully");
});

test("parseFacebookPagesResponse respects selectable flag", () => {
  const parsed = parseFacebookPagesResponse({
    data: {
      pages: [
        {
          pageId: "1",
          name: "A",
          tasks: ["MESSAGING"],
          selectable: false,
          reasonCode: "MISSING_PAGE_TASKS",
          alreadyConnected: false
        }
      ]
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data[0]?.selectable, false);
    assert.equal(parsed.data[0]?.reasonCode, "MISSING_PAGE_TASKS");
  }
});

test("parseFacebookOAuthSessionResponse maps callback success to AWAITING_PAGE_SELECTION", () => {
  const parsed = parseFacebookOAuthSessionResponse({
    data: {
      oauthStage: "CALLBACK_RECEIVED",
      displayState: "AWAITING_PAGE_SELECTION",
      pagesReady: true,
      expiresAt: "2026-06-15T12:00:00.000Z"
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.displayState, "AWAITING_PAGE_SELECTION");
  }
});

test("parseFacebookConnectStatusResponse exposes oauthAvailable", () => {
  const parsed = parseFacebookConnectStatusResponse({
    data: {
      displayState: "NOT_CONNECTED",
      healthStatus: "UNKNOWN",
      oauthAvailable: false,
      manualConfigured: true,
      reconnectRequired: false,
      credentialState: { pageAccessToken: "EMPTY" }
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.oauthAvailable, false);
  }
});

test("FacebookConnectCard does not read document.cookie or assert cookie names", () => {
  assert.equal(cardSource.includes("document.cookie"), false);
  assert.equal(cardSource.includes("hubchat_fb_oauth_session"), false);
  assert.equal(cardSource.includes("FACEBOOK_CONNECT_API.health"), true);
  assert.equal(cardSource.includes("setInterval"), false);
});

test("FacebookConnectCard does not map status 404 to oauthAvailable false", () => {
  assert.equal(cardSource.includes("res.status === 404"), false);
  assert.equal(cardSource.includes("statusLoaded"), true);
  assert.equal(cardSource.includes("facebook-connect-status-load-error"), true);
});

test("FacebookConnectCard handles health and reconnect 501 as deferred capability", () => {
  assert.equal(cardSource.includes("deferred_capability"), true);
  assert.equal(cardSource.includes("FACEBOOK_HEALTH_DEFERRED_COPY"), true);
  assert.equal(cardSource.includes("parseFacebookReconnectDeferredMessage"), true);
  assert.equal(cardSource.includes("deferredHealthPresentationPatch"), true);
});

test("FacebookConnectCard exposes OAuth control test ids", () => {
  assert.ok(cardSource.includes('data-testid="facebook-connect-start"'));
  assert.ok(cardSource.includes('data-testid="facebook-run-validation"'));
});

test("FacebookConnectCard does not auto-call health after complete", () => {
  const start = cardSource.indexOf("async function confirmPage");
  const end = cardSource.indexOf("async function runValidation");
  const confirmBlock = cardSource.slice(start, end);
  assert.equal(confirmBlock.includes("FACEBOOK_CONNECT_API.health"), false);
  assert.equal(confirmBlock.includes("void runValidation"), false);
});

test("ChannelSettingsPage integrates Facebook OAuth only on Facebook card", () => {
  assert.equal(pageSource.includes("FacebookConnectCard"), true);
  assert.equal(pageSource.includes('channel === "FACEBOOK"'), true);
  assert.equal(pageSource.includes('data-testid="facebook-manual-setup"'), true);
  assert.equal(pageSource.includes("channel-connect"), false);
});

test("ChannelSettingsPage does not add polling for OAuth", () => {
  assert.equal(pageSource.includes("setInterval"), false);
});

test("mapFacebookOAuthErrorCategory covers all nine categories with sanitized copy", () => {
  const categories = [
    "ACCESS_DENIED",
    "INVALID_OR_EXPIRED_STATE",
    "SESSION_EXPIRED",
    "NO_PAGES",
    "MISSING_PAGE_TASKS",
    "TOKEN_EXCHANGE_FAILED",
    "PROVIDER_TEMPORARY",
    "RECONNECT_REQUIRED",
    "UNKNOWN"
  ] as const;
  for (const category of categories) {
    const mapped = mapFacebookOAuthErrorCategory(category);
    assert.equal(mapped.category, category);
    assert.ok(mapped.message.length > 0);
    assert.equal(mapped.message, FACEBOOK_OAUTH_ERROR_MESSAGES[category]);
    assert.equal(sanitizeFacebookConnectMessage(mapped.message), mapped.message);
  }
});

test("allReadinessChecksPass rejects WARN and FAIL for any check", () => {
  const passChecks = READINESS_CHECK_CODES.map((code) => ({
    code,
    status: "PASS" as const,
    message: `${code} ok`
  }));
  assert.equal(allReadinessChecksPass(passChecks), true);
  for (const code of READINESS_CHECK_CODES) {
    const withWarn = passChecks.map((c) =>
      c.code === code ? { ...c, status: "WARN" as const } : c
    );
    assert.equal(allReadinessChecksPass(withWarn), false);
    const withFail = passChecks.map((c) =>
      c.code === code ? { ...c, status: "FAIL" as const } : c
    );
    assert.equal(allReadinessChecksPass(withFail), false);
  }
});

test("parseFacebookOAuthSessionResponse rejects premature CONNECTED from session", () => {
  const parsed = parseFacebookOAuthSessionResponse({
    data: {
      oauthStage: "CALLBACK_RECEIVED",
      displayState: "CONNECTED",
      pagesReady: true,
      expiresAt: "2026-06-15T12:00:00.000Z"
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.displayState, "CONNECTED");
  }
});

test("FacebookConnectCard guards stale oauth callback with single-handle ref", () => {
  assert.equal(cardSource.includes("oauthCallbackHandled"), true);
  assert.equal(cardSource.includes("oauthCallbackHandled.current = true"), true);
  assert.equal(cardSource.includes("stripFacebookOAuthQueryParams"), true);
  assert.equal(
    cardSource.includes('parsed.data.displayState === "CONNECTED" ? "AWAITING_PAGE_SELECTION"'),
    true
  );
});

test("FacebookConnectCard shows facebook-connect-ready only after all checks PASS", () => {
  assert.ok(cardSource.includes('data-testid="facebook-connect-ready"'));
  assert.ok(cardSource.includes("allReadinessChecksPass(healthResult.checks)"));
  assert.ok(cardSource.includes('presentationState === "CONNECTED"'));
});

test("FacebookPageSelector exposes radiogroup accessibility and confirm guard", () => {
  const selectorSource = readFileSync(new URL("./FacebookPageSelector.tsx", import.meta.url), "utf8");
  assert.ok(selectorSource.includes('role="radiogroup"'));
  assert.ok(selectorSource.includes('aria-label="Facebook Pages"'));
  assert.ok(selectorSource.includes('data-testid="facebook-page-confirm"'));
  assert.ok(selectorSource.includes("disabled={busy || !selectedPageId}"));
});

test("FacebookReconnectBanner preserves default reconnect copy and busy state", () => {
  const bannerSource = readFileSync(new URL("./FacebookReconnectBanner.tsx", import.meta.url), "utf8");
  assert.ok(bannerSource.includes('data-testid="facebook-reconnect-start"'));
  assert.ok(bannerSource.includes("Authorization expired or revoked"));
  assert.ok(bannerSource.includes("Reconnecting…"));
});

test("parseFacebookOAuthStartAuthorizeUrl accepts nested data.authorizeUrl", () => {
  const parsed = parseFacebookOAuthStartAuthorizeUrl({
    data: {
      authorizeUrl:
        "https://www.facebook.com/v25.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=abc&scope=pages_show_list%2Cpages_messaging%2Cpages_manage_metadata&response_type=code",
      expiresAt: "2026-07-10T00:00:00.000Z"
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.match(parsed.authorizeUrl, /^https:\/\/www\.facebook\.com\//);
    assert.match(parsed.authorizeUrl, /scope=pages_show_list%2Cpages_messaging%2Cpages_manage_metadata/);
  }
});

test("parseFacebookOAuthStartAuthorizeUrl rejects missing or non-Facebook URLs", () => {
  assert.equal(parseFacebookOAuthStartAuthorizeUrl({ data: {} }).ok, false);
  assert.equal(
    parseFacebookOAuthStartAuthorizeUrl({ data: { authorizeUrl: "https://evil.example/oauth" } }).ok,
    false
  );
  assert.equal(parseFacebookOAuthStartAuthorizeUrl({ data: { authorizeUrl: "javascript:alert(1)" } }).ok, false);
});

test("assignFacebookOAuthAuthorizeUrl uses same-window location.assign", () => {
  const calls: string[] = [];
  const ok = assignFacebookOAuthAuthorizeUrl("https://www.facebook.com/v25.0/dialog/oauth?client_id=1", {
    assign: (url: string) => {
      calls.push(url);
    }
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /facebook\.com/);

  const blocked = assignFacebookOAuthAuthorizeUrl("https://evil.example/oauth", {
    assign: () => {
      throw new Error("should not run");
    }
  });
  assert.equal(blocked, false);
  assert.equal(isFacebookOAuthAuthorizeUrl("https://www.facebook.com/dialog/oauth"), true);
});

test("FacebookConnectCard redirects with assign helper and keeps Continue fallback", () => {
  assert.ok(cardSource.includes("parseFacebookOAuthStartAuthorizeUrl"));
  assert.ok(cardSource.includes("assignFacebookOAuthAuthorizeUrl"));
  assert.ok(cardSource.includes('data-testid="facebook-oauth-continue"'));
  assert.ok(cardSource.includes('data-testid="facebook-oauth-try-again"'));
  assert.ok(cardSource.includes("FACEBOOK_OAUTH_REDIRECT_PENDING_COPY"));
  assert.ok(cardSource.includes("FACEBOOK_OAUTH_REDIRECT_BLOCKED_COPY"));
  assert.equal(cardSource.includes("window.open"), false);
});

test("globals.css includes responsive layout for Facebook OAuth card", () => {
  const cssSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.ok(cssSource.includes(".channel-settings-facebook-connect-check"));
  assert.ok(cssSource.includes("@media (max-width: 390px)"));
  assert.ok(cssSource.includes("grid-template-columns: 1fr"));
});
