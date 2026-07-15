import test from "node:test";
import assert from "node:assert/strict";
import { deriveFacebookOAuthDisplayState } from "./facebookOAuthDisplayState.js";

test("callback success maps to AWAITING_PAGE_SELECTION", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      oauthStage: "CALLBACK_RECEIVED",
      connectionStatus: "AUTHORIZING",
      healthStatus: "UNKNOWN"
    }),
    "AWAITING_PAGE_SELECTION"
  );
});

test("complete success maps to CONNECTING not CONNECTED", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      oauthStage: "COMPLETED",
      connectionStatus: "AUTHORIZING",
      healthStatus: "UNKNOWN"
    }),
    "CONNECTING"
  );
});

test("pre-READY health DEGRADED with AUTHORIZING stays CONNECTING", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      oauthStage: "COMPLETED",
      connectionStatus: "AUTHORIZING",
      healthStatus: "DEGRADED"
    }),
    "CONNECTING"
  );
});

test("AUTHORIZING with UNKNOWN health is CONNECTING not NEEDS_RECONNECT", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      oauthStage: "COMPLETED",
      connectionStatus: "AUTHORIZING",
      healthStatus: "UNKNOWN",
      reconnectRequired: false
    }),
    "CONNECTING"
  );
});

test("READY + OK maps to CONNECTED", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      connectionStatus: "READY",
      healthStatus: "OK",
      reconnectRequired: false
    }),
    "CONNECTED"
  );
});

test("true reconnectRequired still maps to NEEDS_RECONNECT", () => {
  assert.equal(
    deriveFacebookOAuthDisplayState({
      connectionStatus: "RECONNECT_REQUIRED",
      healthStatus: "RECONNECT_REQUIRED",
      reconnectRequired: true
    }),
    "NEEDS_RECONNECT"
  );
});
