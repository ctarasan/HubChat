import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allReadinessChecksPass,
  buildFacebookCompleteBody,
  deriveFacebookConnectPresentationState,
  FACEBOOK_OAUTH_ERROR_MESSAGES,
  mapFacebookOAuthErrorCategory,
  parseFacebookCompleteResponse,
  parseFacebookConnectStatusResponse,
  parseFacebookHealthResponse,
  parseFacebookOAuthSessionResponse,
  parseFacebookPagesResponse,
  READINESS_CHECK_CODES,
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
      displayState: "CONNECTED",
      checks: []
    }
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.healthStatus, "UNKNOWN");
  }
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
