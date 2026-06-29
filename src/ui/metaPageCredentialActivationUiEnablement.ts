/**
 * META-CRED-1D-M-A — Review-button enablement helpers (token-free).
 * Token presence is boolean-only; never store token strings in React state.
 */

export type MetaActivationReviewPhase =
  | "idle"
  | "confirming"
  | "submitting"
  | "success"
  | "error"
  | "uncertain"
  | "completed_blocked";

export function deriveTokenPresentFromInputValue(value: string): boolean {
  return value.trim().length > 0;
}

export function isMetaActivationFormLocked(input: {
  parentDisabled: boolean;
  phase: MetaActivationReviewPhase;
}): boolean {
  return (
    input.parentDisabled ||
    input.phase === "submitting" ||
    input.phase === "success" ||
    input.phase === "completed_blocked" ||
    input.phase === "uncertain"
  );
}

export function isMetaActivationReviewButtonVisible(phase: MetaActivationReviewPhase): boolean {
  return phase !== "confirming" && phase !== "submitting";
}

export function isMetaActivationReviewEnabled(input: {
  formLocked: boolean;
  hasSelectedTarget: boolean;
  tokenPresent: boolean;
  parentDisabled: boolean;
  inFlight: boolean;
  phase: MetaActivationReviewPhase;
}): boolean {
  if (!isMetaActivationReviewButtonVisible(input.phase)) return false;
  if (input.parentDisabled || input.inFlight || input.formLocked) return false;
  if (!input.hasSelectedTarget || !input.tokenPresent) return false;
  return true;
}

export type MetaActivationUiEnablementState = {
  tokenPresent: boolean;
  phase: MetaActivationReviewPhase;
  selectedConnectionId: string | null;
  parentDisabled: boolean;
  inFlight: boolean;
};

export type MetaActivationUiEnablementEvent =
  | { type: "init" }
  | { type: "token_input"; value: string }
  | { type: "clear_token_input" }
  | { type: "select_target"; connectionId: string }
  | { type: "parent_disabled"; disabled: boolean }
  | { type: "in_flight"; inFlight: boolean }
  | { type: "open_confirmation" }
  | { type: "definitive_success" }
  | { type: "definitive_failure" }
  | { type: "cancel_uncertain" }
  | { type: "tenant_reset" };

export function isReviewEnabledForState(state: MetaActivationUiEnablementState): boolean {
  return isMetaActivationReviewEnabled({
    formLocked: isMetaActivationFormLocked({
      parentDisabled: state.parentDisabled,
      phase: state.phase
    }),
    hasSelectedTarget: state.selectedConnectionId !== null,
    tokenPresent: state.tokenPresent,
    parentDisabled: state.parentDisabled,
    inFlight: state.inFlight,
    phase: state.phase
  });
}

export function metaActivationUiEnablementReducer(
  state: MetaActivationUiEnablementState,
  event: MetaActivationUiEnablementEvent
): MetaActivationUiEnablementState {
  switch (event.type) {
    case "init":
      return {
        tokenPresent: false,
        phase: "idle",
        selectedConnectionId: null,
        parentDisabled: false,
        inFlight: false
      };
    case "token_input":
      return { ...state, tokenPresent: deriveTokenPresentFromInputValue(event.value) };
    case "clear_token_input":
      return { ...state, tokenPresent: false };
    case "select_target":
      return {
        ...state,
        selectedConnectionId: event.connectionId,
        tokenPresent: false,
        phase: "idle"
      };
    case "parent_disabled":
      return { ...state, parentDisabled: event.disabled };
    case "in_flight":
      return {
        ...state,
        inFlight: event.inFlight,
        phase: event.inFlight ? "submitting" : state.phase
      };
    case "open_confirmation": {
      if (!isReviewEnabledForState(state)) return state;
      return { ...state, phase: "confirming" };
    }
    case "definitive_success":
      return { ...state, phase: "success", tokenPresent: false, inFlight: false };
    case "definitive_failure":
      return { ...state, phase: "error", tokenPresent: false, inFlight: false };
    case "cancel_uncertain":
      return { ...state, phase: "idle", tokenPresent: false, inFlight: false };
    case "tenant_reset":
      return {
        tokenPresent: false,
        phase: "idle",
        selectedConnectionId: null,
        parentDisabled: state.parentDisabled,
        inFlight: false
      };
    default:
      return state;
  }
}
