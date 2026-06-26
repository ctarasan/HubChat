import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cardSource = readFileSync(new URL("./MetaPageCredentialActivationCard.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./metaPageCredentialActivationUiModel.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");

const FAKE_TOKEN = "EAA_FAKE_TEST_TOKEN_MARKER_FOR_UNIT_TESTS_ONLY";

test("Meta activation card is integrated on Channel Settings FACEBOOK section", () => {
  assert.equal(pageSource.includes("MetaPageCredentialActivationCard"), true);
  assert.ok(pageSource.includes('channel === "FACEBOOK" && tenantId && session'));
});

test("activation UI uses password token input with secure attributes", () => {
  assert.match(cardSource, /type="password"/);
  assert.match(cardSource, /autoComplete="new-password"/);
  assert.match(cardSource, /spellCheck=\{false\}/);
  assert.equal(cardSource.includes("localStorage"), false);
  assert.equal(cardSource.includes("sessionStorage"), false);
});

test("token input is uncontrolled via ref rather than persisted React state", () => {
  assert.equal(cardSource.includes("tokenInputRef"), true);
  assert.equal(cardSource.includes("useState"), true);
  assert.equal(cardSource.includes(`useState("${FAKE_TOKEN}")`), false);
  assert.equal(cardSource.includes("value={token"), false);
});

test("activation fetch uses reviewed tenant headers and activation route", () => {
  assert.equal(modelSource.includes("/api/channel-connect/meta/verify-and-activate"), true);
  assert.match(modelSource, /"x-tenant-id": tenantId/);
  assert.match(cardSource, /"Idempotency-Key"/);
});

test("fixed FACEBOOK-only contract is enforced in request builder", () => {
  assert.equal(modelSource.includes("META_ACTIVATION_FIXED_REQUESTED_CHANNELS"), true);
  assert.equal(modelSource.includes("META_ACTIVATION_FIXED_EXPECTED_VERSION"), true);
  assert.equal(modelSource.includes("buildFacebookOnlyActivationBody"), true);
  assert.equal(modelSource.includes("instagramConnectionId"), false);
});

test("idempotency key is generated in-app via injectable randomUuid", () => {
  assert.equal(cardSource.includes("randomUuid"), true);
  assert.equal(cardSource.includes("buildActivationIntent"), true);
  assert.equal(cardSource.includes("crypto.randomUUID"), true);
});

test("confirmation panel excludes token and shows fixed contract fields", () => {
  assert.equal(cardSource.includes("meta-activation-confirm-summary"), true);
  assert.equal(cardSource.includes("Resolver cutover: NO"), true);
  assert.equal(cardSource.includes("Expected credential version"), true);
  assert.equal(cardSource.includes("Credential ID: new / omitted"), true);
  const confirmBlock = cardSource.slice(
    cardSource.indexOf("const confirmationSummary"),
    cardSource.indexOf("if (phase === \"confirming\"")
  );
  assert.equal(confirmBlock.includes("tokenInputRef"), false);
  assert.equal(confirmBlock.includes("accessToken"), false);
});

test("no console logging in activation card", () => {
  assert.equal(cardSource.includes("console.log"), false);
  assert.equal(cardSource.includes("console.debug"), false);
  assert.equal(cardSource.includes("console.info"), false);
});

test("disabled gate preflight uses probe body without real token", () => {
  assert.equal(cardSource.includes("checkActivationGate"), true);
  assert.equal(cardSource.includes("buildDisabledGateProbeBody"), true);
  assert.equal(cardSource.includes("meta-activation-check-gate"), true);
});

test("uncertain response preserves intent and supports explicit replay only", () => {
  assert.equal(cardSource.includes("uncertainIntentRef"), true);
  assert.equal(cardSource.includes("Replay exact request"), true);
  assert.equal(cardSource.includes("globalThis.confirm"), true);
  assert.equal(cardSource.includes("setInterval"), false);
});

test("success state shows ACTIVATED_HEALTHY_PENDING_CUTOVER and never READY claim", () => {
  assert.equal(cardSource.includes("ACTIVATED_HEALTHY_PENDING_CUTOVER"), true);
  assert.equal(cardSource.includes('"READY"'), false);
  assert.match(cardSource, /Channel READY is not claimed/);
});

test("submit is blocked while in flight via inFlightRef", () => {
  assert.equal(cardSource.includes("inFlightRef"), true);
  assert.equal(cardSource.includes("if (inFlightRef.current) return"), true);
});

test("token input clears after definitive response", () => {
  assert.equal(cardSource.includes("clearTokenInput"), true);
  assert.ok(cardSource.includes("tokenInputRef.current.value = \"\""));
});
