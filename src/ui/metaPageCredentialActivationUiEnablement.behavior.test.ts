import test from "node:test";
import assert from "node:assert/strict";
import {
  assertActivationRenderSafe,
  buildMetaActivationConfirmationSummary,
  META_ACTIVATION_FIXED_EXPECTED_VERSION
} from "./metaPageCredentialActivationUiModel.js";
import {
  deriveTokenPresentFromInputValue,
  isMetaActivationReviewEnabled,
  isReviewEnabledForState,
  metaActivationUiEnablementReducer,
  type MetaActivationUiEnablementState
} from "./metaPageCredentialActivationUiEnablement.js";

const FAKE_TOKEN = "TEST_FAKE_PAGE_TOKEN_MUST_NOT_RENDER";
const TARGET = {
  connectionId: "507d5519-8f4f-4973-99f1-7b00af25279d",
  connectionStatus: "READY",
  providerPageId: "541846535686129",
  providerPageName: "SMARTKORP",
  publicConnectionKey: "fb-main"
};
const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

function baseState(overrides: Partial<MetaActivationUiEnablementState> = {}): MetaActivationUiEnablementState {
  return {
    tokenPresent: false,
    phase: "idle",
    selectedConnectionId: TARGET.connectionId,
    parentDisabled: false,
    inFlight: false,
    ...overrides
  };
}

test("initial state: target selected, blank token → review disabled", () => {
  const state = baseState();
  assert.equal(isReviewEnabledForState(state), false);
});

test("deriveTokenPresentFromInputValue rejects whitespace-only input", () => {
  assert.equal(deriveTokenPresentFromInputValue(""), false);
  assert.equal(deriveTokenPresentFromInputValue("   "), false);
  assert.equal(deriveTokenPresentFromInputValue("\n\t"), false);
});

test("typing fake token enables review", () => {
  let state = baseState();
  state = metaActivationUiEnablementReducer(state, { type: "token_input", value: FAKE_TOKEN });
  assert.equal(state.tokenPresent, true);
  assert.equal(isReviewEnabledForState(state), true);
});

test("pasting fake token enables review", () => {
  let state = baseState();
  state = metaActivationUiEnablementReducer(state, {
    type: "token_input",
    value: `  ${FAKE_TOKEN}  `
  });
  assert.equal(state.tokenPresent, true);
  assert.equal(isReviewEnabledForState(state), true);
});

test("clearing token disables review", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, { type: "token_input", value: "" });
  assert.equal(state.tokenPresent, false);
  assert.equal(isReviewEnabledForState(state), false);
});

test("replacing token keeps review enabled without creating requests", () => {
  let state = baseState();
  state = metaActivationUiEnablementReducer(state, { type: "token_input", value: FAKE_TOKEN });
  state = metaActivationUiEnablementReducer(state, { type: "token_input", value: `${FAKE_TOKEN}-v2` });
  assert.equal(state.tokenPresent, true);
  assert.equal(isReviewEnabledForState(state), true);
  assert.equal(state.phase, "idle");
});

test("no selected target disables review even with token", () => {
  const state = baseState({ tokenPresent: true, selectedConnectionId: null });
  assert.equal(isReviewEnabledForState(state), false);
});

test("parent disabled blocks review", () => {
  const state = baseState({ tokenPresent: true, parentDisabled: true });
  assert.equal(isReviewEnabledForState(state), false);
});

test("in-flight blocks review", () => {
  const state = baseState({ tokenPresent: true, inFlight: true, phase: "submitting" });
  assert.equal(isReviewEnabledForState(state), false);
});

test("form locked phases block review", () => {
  for (const phase of ["success", "uncertain", "completed_blocked", "submitting"] as const) {
    const state = baseState({ tokenPresent: true, phase, inFlight: phase === "submitting" });
    assert.equal(isReviewEnabledForState(state), false, `expected locked for phase ${phase}`);
  }
});

test("error phase permits review after definitive failure when token re-entered", () => {
  const state = baseState({ tokenPresent: true, phase: "error" });
  assert.equal(isReviewEnabledForState(state), true);
});

test("open confirmation after token entry moves to confirming phase", () => {
  let state = baseState();
  state = metaActivationUiEnablementReducer(state, { type: "token_input", value: FAKE_TOKEN });
  state = metaActivationUiEnablementReducer(state, { type: "open_confirmation" });
  assert.equal(state.phase, "confirming");
});

test("open confirmation blocked when review disabled", () => {
  let state = baseState();
  state = metaActivationUiEnablementReducer(state, { type: "open_confirmation" });
  assert.equal(state.phase, "idle");
});

test("confirmation summary is FACEBOOK-only and omits token", () => {
  const summary = buildMetaActivationConfirmationSummary({ tenantId: TENANT_ID, target: TARGET });
  assert.match(summary, /FACEBOOK only/);
  assert.match(summary, /Expected credential version: 0/);
  assert.match(summary, /Credential ID: new \/ omitted/);
  assert.match(summary, /Resolver cutover: NO/);
  assert.equal(summary.includes(FAKE_TOKEN), false);
  assert.doesNotThrow(() => assertActivationRenderSafe(summary));
});

test("definitive success clears token-present state", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, { type: "definitive_success" });
  assert.equal(state.tokenPresent, false);
  assert.equal(state.phase, "success");
  assert.equal(isReviewEnabledForState(state), false);
});

test("definitive failure clears token-present state", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, { type: "definitive_failure" });
  assert.equal(state.tokenPresent, false);
  assert.equal(state.phase, "error");
  assert.equal(isReviewEnabledForState(state), false);
});

test("cancel uncertain resets token-present state", () => {
  let state = baseState({ tokenPresent: true, phase: "uncertain" });
  state = metaActivationUiEnablementReducer(state, { type: "cancel_uncertain" });
  assert.equal(state.tokenPresent, false);
  assert.equal(state.phase, "idle");
});

test("target change invalidates token-present state", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, {
    type: "select_target",
    connectionId: "a0000000-0000-4000-8000-000000000001"
  });
  assert.equal(state.tokenPresent, false);
  assert.equal(state.phase, "idle");
});

test("tenant reset clears token-present state and target", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, { type: "tenant_reset" });
  assert.equal(state.tokenPresent, false);
  assert.equal(state.selectedConnectionId, null);
  assert.equal(state.phase, "idle");
});

test("clear_token_input event resets token-present boolean", () => {
  let state = baseState({ tokenPresent: true });
  state = metaActivationUiEnablementReducer(state, { type: "clear_token_input" });
  assert.equal(state.tokenPresent, false);
});

test("repeated renders: token_present toggles enablement deterministically", () => {
  for (let i = 0; i < 5; i += 1) {
    const enabled = isMetaActivationReviewEnabled({
      formLocked: false,
      hasSelectedTarget: true,
      tokenPresent: i % 2 === 1,
      parentDisabled: false,
      inFlight: false,
      phase: "idle"
    });
    assert.equal(enabled, i % 2 === 1);
  }
});

test("expected credential version contract unchanged", () => {
  assert.equal(META_ACTIVATION_FIXED_EXPECTED_VERSION, 0);
});
