import test from "node:test";
import assert from "node:assert/strict";
import {
  activationIntentRequestBody,
  assertActivationRenderSafe,
  buildActivationIntent,
  buildDisabledGateProbeBody,
  buildFacebookOnlyActivationBody,
  generateActivationIdempotencyKey,
  mapDisabledGateResultMessage,
  parseDisabledGateResponse,
  sanitizeTenantDisplayLabel
} from "./metaPageCredentialActivationUiModel.js";

const FAKE_TOKEN = "EAA_FAKE_TEST_TOKEN_MARKER_FOR_UNIT_TESTS_ONLY";
const TARGET = {
  connectionId: "507d0000-0000-4000-8000-00000000279d",
  connectionStatus: "READY",
  providerPageId: "541846535668129",
  providerPageName: "Main Page",
  publicConnectionKey: "fb-main"
};

test("buildFacebookOnlyActivationBody uses fixed FACEBOOK-only contract", () => {
  const body = buildFacebookOnlyActivationBody({
    accessToken: FAKE_TOKEN,
    facebookConnectionId: TARGET.connectionId
  });
  assert.deepEqual(body.requestedChannels, ["FACEBOOK"]);
  assert.equal(body.expectedCredentialVersion, 0);
  assert.equal(body.credentialId, undefined);
  assert.equal(body.facebookConnectionId, TARGET.connectionId);
  assert.equal(body.instagramConnectionId, undefined);
});

test("disabled gate probe uses empty token and fixed contract", () => {
  const body = buildDisabledGateProbeBody(TARGET.connectionId);
  assert.equal(body.accessToken, "");
  assert.deepEqual(body.requestedChannels, ["FACEBOOK"]);
  assert.equal(body.expectedCredentialVersion, 0);
});

test("generateActivationIdempotencyKey uses injected UUID and respects length", () => {
  const key = generateActivationIdempotencyKey(() => "11111111-2222-4333-8444-555555555555");
  assert.equal(key, "11111111-2222-4333-8444-555555555555");
  assert.ok(key.length <= 128);
});

test("buildActivationIntent binds target connection and generates idempotency key", () => {
  const intent = buildActivationIntent({
    randomUuid: () => "idem-activation-1",
    accessToken: FAKE_TOKEN,
    target: TARGET,
    tenantId: "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f"
  });
  assert.equal(intent.idempotencyKey, "idem-activation-1");
  assert.equal(intent.facebookConnectionId, TARGET.connectionId);
  assert.equal(intent.accessToken, FAKE_TOKEN);
  const body = activationIntentRequestBody(intent);
  assert.deepEqual(body.requestedChannels, ["FACEBOOK"]);
  assert.equal(body.expectedCredentialVersion, 0);
});

test("parseDisabledGateResponse recognizes disabled gate", () => {
  const result = parseDisabledGateResponse(503, { code: "META_ACTIVATION_DISABLED" });
  assert.equal(result.kind, "disabled_as_expected");
  assert.equal(mapDisabledGateResultMessage(result).includes("disabled as expected"), true);
});

test("parseDisabledGateResponse treats 400 invalid input as unexpectedly enabled path", () => {
  const result = parseDisabledGateResponse(400, { code: "META_ACTIVATION_INPUT_INVALID" });
  assert.equal(result.kind, "unexpected_enabled");
});

test("confirmation rendering rejects token markers", () => {
  const summary = `Tenant: ${sanitizeTenantDisplayLabel("ba82d847-53cd-4b60-9e4d-5fd3f8ad865f")}\nFacebook Page: Main Page`;
  assert.doesNotThrow(() => assertActivationRenderSafe(summary));
  assert.throws(() => assertActivationRenderSafe(summary + FAKE_TOKEN));
});
