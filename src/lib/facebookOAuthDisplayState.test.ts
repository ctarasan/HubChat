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
