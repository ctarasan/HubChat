"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionConfig } from "./sessionConfig.js";
import {
  META_PAGE_ACTIVATION_API,
  META_ACTIVATION_DISABLED_GATE_PROBE_CONNECTION_ID,
  META_ACTIVATION_FIXED_EXPECTED_VERSION,
  META_ACTIVATION_FIXED_REQUESTED_CHANNELS,
  activationIntentRequestBody,
  assertActivationRenderSafe,
  buildActivationIntent,
  buildDisabledGateProbeBody,
  formatConnectionIdentity,
  formatPageIdentity,
  mapActivationFetchError,
  mapDisabledGateResultMessage,
  metaActivationFetch,
  parseActivationSuccessResponse,
  parseActivationTargetsResponse,
  parseDisabledGateResponse,
  sanitizeTenantDisplayLabel,
  type MetaActivationDisabledGateResult,
  type MetaActivationIntent,
  type MetaActivationSuccessData,
  type MetaActivationTarget
} from "./metaPageCredentialActivationUiModel.js";

export type MetaPageCredentialActivationCardProps = {
  session: SessionConfig;
  tenantId: string;
  disabled?: boolean;
  randomUuid?: () => string;
};

type FlowPhase =
  | "idle"
  | "confirming"
  | "submitting"
  | "success"
  | "error"
  | "uncertain"
  | "completed_blocked";

type GateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; result: MetaActivationDisabledGateResult; message: string };

function defaultRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

export function MetaPageCredentialActivationCard({
  session,
  tenantId,
  disabled = false,
  randomUuid = defaultRandomUuid
}: MetaPageCredentialActivationCardProps) {
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const uncertainIntentRef = useRef<MetaActivationIntent | null>(null);

  const [targets, setTargets] = useState<MetaActivationTarget[]>([]);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [successData, setSuccessData] = useState<MetaActivationSuccessData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gateCheck, setGateCheck] = useState<GateCheckState>({ kind: "idle" });

  const selectedTarget = targets.find((t) => t.connectionId === selectedConnectionId) ?? null;
  const uncertainIntent = uncertainIntentRef.current;
  const formLocked =
    disabled || phase === "submitting" || phase === "success" || phase === "completed_blocked" || phase === "uncertain";

  const loadTargets = useCallback(async () => {
    setTargetsError(null);
    try {
      const { res, body } = await metaActivationFetch(
        session,
        tenantId,
        META_PAGE_ACTIVATION_API.targets
      );
      if (!res.ok) {
        setTargetsError(mapActivationFetchError(res.status, body));
        setTargetsLoaded(true);
        return;
      }
      const parsed = parseActivationTargetsResponse(body);
      if (!parsed.ok) {
        setTargetsError(parsed.error);
        setTargetsLoaded(true);
        return;
      }
      setTargets(parsed.data.targets);
      if (parsed.data.targets.length === 1) {
        setSelectedConnectionId(parsed.data.targets[0]!.connectionId);
      }
      setTargetsLoaded(true);
    } catch {
      setTargetsError("Could not load activation targets.");
      setTargetsLoaded(true);
    }
  }, [session, tenantId]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  function clearTokenInput(): void {
    if (tokenInputRef.current) tokenInputRef.current.value = "";
  }

  function invalidateUncertainIntent(): void {
    uncertainIntentRef.current = null;
    if (phase === "uncertain") setPhase("idle");
  }

  function handleConnectionChange(connectionId: string): void {
    if (formLocked) return;
    invalidateUncertainIntent();
    setSelectedConnectionId(connectionId);
    setAcknowledged(false);
    setPhase("idle");
    setErrorMessage(null);
    setSuccessData(null);
  }

  function handleTokenInput(): void {
    if (formLocked) return;
    invalidateUncertainIntent();
    setAcknowledged(false);
    setPhase((current) => {
      if (current === "success" || current === "error" || current === "completed_blocked") {
        return "idle";
      }
      return current;
    });
    setErrorMessage(null);
    setSuccessData(null);
  }

  function canProceedToConfirm(): boolean {
    if (formLocked || !selectedTarget) return false;
    const token = tokenInputRef.current?.value.trim() ?? "";
    return token.length > 0;
  }

  function openConfirmation(): void {
    if (!canProceedToConfirm() || !selectedTarget) return;
    setErrorMessage(null);
    setSuccessData(null);
    setPhase("confirming");
  }

  async function submitIntent(intent: MetaActivationIntent, isReplay: boolean): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const body = activationIntentRequestBody(intent);
      const { res, body: responseBody } = await metaActivationFetch(
        session,
        tenantId,
        META_PAGE_ACTIVATION_API.activate,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": intent.idempotencyKey
          },
          body: JSON.stringify(body)
        }
      );
      if (!res.ok) {
        const message = mapActivationFetchError(res.status, responseBody);
        uncertainIntentRef.current = null;
        clearTokenInput();
        setErrorMessage(message);
        setPhase("error");
        return;
      }
      const parsed = parseActivationSuccessResponse(responseBody);
      if (!parsed.ok) {
        uncertainIntentRef.current = null;
        clearTokenInput();
        setErrorMessage(parsed.error);
        setPhase("error");
        return;
      }
      uncertainIntentRef.current = null;
      clearTokenInput();
      setSuccessData(parsed.data);
      setAcknowledged(false);
      setPhase(parsed.data.state === "ACTIVATED_HEALTHY_PENDING_CUTOVER" ? "success" : "completed_blocked");
    } catch {
      uncertainIntentRef.current = intent;
      setPhase("uncertain");
      setErrorMessage(
        isReplay
          ? "Network error while replaying activation. Outcome may already be committed. Do not change the token or target."
          : "Network error during activation. Outcome may already be committed. Use exact replay or stop for read-only verification."
      );
    } finally {
      inFlightRef.current = false;
    }
  }

  async function submitActivation(): Promise<void> {
    if (!selectedTarget || inFlightRef.current) return;
    const token = tokenInputRef.current?.value.trim() ?? "";
    if (!token) return;
    let intent: MetaActivationIntent;
    try {
      intent = buildActivationIntent({
        randomUuid,
        accessToken: token,
        target: selectedTarget,
        tenantId
      });
    } catch {
      setErrorMessage("Page access token is required.");
      setPhase("error");
      return;
    }
    await submitIntent(intent, false);
  }

  async function replayUncertainIntent(): Promise<void> {
    const intent = uncertainIntentRef.current;
    if (!intent || inFlightRef.current) return;
    const confirmed = globalThis.confirm(
      "Replay the exact same activation request with the same idempotency key and token? Only continue if you intend to retry after a network error."
    );
    if (!confirmed) return;
    await submitIntent(intent, true);
  }

  function cancelUncertainIntent(): void {
    uncertainIntentRef.current = null;
    clearTokenInput();
    setAcknowledged(false);
    setPhase("idle");
    setErrorMessage(null);
  }

  async function checkActivationGate(): Promise<void> {
    if (inFlightRef.current) return;
    setGateCheck({ kind: "checking" });
    const probeConnectionId =
      selectedTarget?.connectionId ?? META_ACTIVATION_DISABLED_GATE_PROBE_CONNECTION_ID;
    const idempotencyKey = `gate-probe:${randomUuid()}`;
    try {
      const { res, body } = await metaActivationFetch(
        session,
        tenantId,
        META_PAGE_ACTIVATION_API.activate,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify(buildDisabledGateProbeBody(probeConnectionId))
        }
      );
      const result = parseDisabledGateResponse(res.status, body);
      const message = mapDisabledGateResultMessage(result);
      setGateCheck({ kind: "result", result, message });
    } catch {
      setGateCheck({
        kind: "result",
        result: { kind: "transport_uncertain" },
        message: mapDisabledGateResultMessage({ kind: "transport_uncertain" })
      });
    }
  }

  const confirmationSummary = selectedTarget
    ? [
        `Tenant: ${sanitizeTenantDisplayLabel(tenantId)}`,
        `Facebook connection: ${formatConnectionIdentity(selectedTarget)}`,
        `Facebook Page: ${formatPageIdentity(selectedTarget)}`,
        `Requested channels: ${META_ACTIVATION_FIXED_REQUESTED_CHANNELS.join(", ")} only`,
        `Expected credential version: ${META_ACTIVATION_FIXED_EXPECTED_VERSION}`,
        "Credential ID: new / omitted",
        "Resolver cutover: NO"
      ].join("\n")
    : "";

  if (phase === "confirming" && confirmationSummary) {
    assertActivationRenderSafe(confirmationSummary);
  }

  const submitEnabled =
    phase === "confirming" &&
    acknowledged &&
    selectedTarget !== null &&
    !inFlightRef.current &&
    !disabled;

  return (
    <section
      className="channel-settings-meta-activation"
      data-testid="meta-activation-section"
      aria-label="Meta Page credential activation"
    >
      <div className="channel-settings-meta-activation-head">
        <p className="channel-settings-label">Meta Page credential activation</p>
        <span className="channel-settings-status-badge channel-settings-status-not-configured" data-testid="meta-activation-scope-badge">
          FACEBOOK only · ADMIN
        </span>
      </div>

      <p className="hint channel-settings-meta-activation-warning" data-testid="meta-activation-admin-warning" role="note">
        Admin-only one-shot activation. Token is write-only and will not be shown again. Resolver cutover remains NO.
        No automatic retry. One activation intent per confirmation.
      </p>

      <div className="channel-settings-meta-activation-gate" data-testid="meta-activation-gate-check">
        <p className="channel-settings-label">Activation gate check</p>
        <p className="hint">
          Verify the activation API returns disabled (503 META_ACTIVATION_DISABLED) while the feature flag is off. No
          real token is sent.
        </p>
        <button
          type="button"
          className="inbox-filter-btn"
          data-testid="meta-activation-check-gate"
          disabled={disabled || gateCheck.kind === "checking" || inFlightRef.current}
          onClick={() => void checkActivationGate()}
        >
          {gateCheck.kind === "checking" ? "Checking…" : "Check activation gate"}
        </button>
        {gateCheck.kind === "result" ? (
          <p
            className={`hint channel-settings-meta-activation-gate-result channel-settings-meta-activation-gate-${gateCheck.result.kind}`}
            data-testid="meta-activation-gate-result"
            role="status"
          >
            {gateCheck.message}
          </p>
        ) : null}
      </div>

      {targetsError ? (
        <p className="hint channel-settings-meta-activation-error" data-testid="meta-activation-targets-error" role="alert">
          {targetsError}
        </p>
      ) : null}

      {targetsLoaded && targets.length === 0 && !targetsError ? (
        <p className="hint" data-testid="meta-activation-no-targets">
          No eligible READY Facebook connections are available for activation in this tenant.
        </p>
      ) : null}

      {targets.length > 0 ? (
        <fieldset className="channel-settings-meta-activation-targets" disabled={formLocked} data-testid="meta-activation-targets">
          <legend className="channel-settings-label">Facebook connection</legend>
          {targets.map((target) => (
            <label key={target.connectionId} className="channel-settings-meta-activation-target-option">
              <input
                type="radio"
                name="meta-activation-target"
                value={target.connectionId}
                checked={selectedConnectionId === target.connectionId}
                disabled={formLocked}
                data-testid={`meta-activation-target-${target.connectionId}`}
                onChange={() => handleConnectionChange(target.connectionId)}
              />
              <span>
                {formatConnectionIdentity(target)} · Page {formatPageIdentity(target)} · {target.connectionStatus}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="channel-settings-field channel-settings-meta-activation-token">
        <span className="channel-settings-label">Facebook Page access token</span>
        <input
          ref={tokenInputRef}
          type="password"
          className="channel-settings-secret-input"
          autoComplete="new-password"
          spellCheck={false}
          placeholder="Enter Page access token"
          disabled={formLocked}
          data-testid="meta-activation-token-input"
          onChange={handleTokenInput}
        />
        <span className="hint">Masked input. Not stored in browser storage. Cleared after a definitive response.</span>
      </label>

      {phase !== "confirming" && phase !== "submitting" ? (
        <button
          type="button"
          className="team-members-add-btn"
          data-testid="meta-activation-review"
          disabled={!canProceedToConfirm() || disabled || inFlightRef.current}
          onClick={openConfirmation}
        >
          Review activation
        </button>
      ) : null}

      {phase === "confirming" || phase === "submitting" ? (
        <div className="channel-settings-meta-activation-confirm" data-testid="meta-activation-confirmation">
          <p className="channel-settings-label">Confirm activation contract</p>
          <pre className="channel-settings-meta-activation-confirm-summary" data-testid="meta-activation-confirm-summary">
            {confirmationSummary}
          </pre>
          <label className="channel-settings-field channel-settings-meta-activation-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={formLocked}
              data-testid="meta-activation-ack"
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I confirm this FACEBOOK-only initial activation (expected version 0). Resolver cutover remains NO.</span>
          </label>
          <button
            type="button"
            className="team-members-add-btn"
            data-testid="meta-activation-submit"
            disabled={!submitEnabled}
            onClick={() => void submitActivation()}
          >
            {phase === "submitting" ? "Submitting…" : "Submit activation"}
          </button>
        </div>
      ) : null}

      {phase === "uncertain" && uncertainIntent ? (
        <div className="channel-settings-meta-activation-uncertain" data-testid="meta-activation-uncertain" role="alert">
          <p className="channel-settings-label">Uncertain outcome</p>
          <p className="hint">{errorMessage}</p>
          <p className="hint">Request fields are locked while the uncertain intent is pending in memory only.</p>
          <button
            type="button"
            className="team-members-add-btn"
            data-testid="meta-activation-replay"
            disabled={inFlightRef.current}
            onClick={() => void replayUncertainIntent()}
          >
            Replay exact request
          </button>
          <button
            type="button"
            className="inbox-filter-btn"
            data-testid="meta-activation-cancel-uncertain"
            disabled={inFlightRef.current}
            onClick={cancelUncertainIntent}
          >
            Cancel uncertain intent
          </button>
        </div>
      ) : null}

      {phase === "success" && successData ? (
        <div className="channel-settings-meta-activation-success" data-testid="meta-activation-success" role="status">
          <p className="channel-settings-label">Activation result</p>
          <p data-testid="meta-activation-result-state">State: {successData.state}</p>
          <p data-testid="meta-activation-result-credential">
            Credential: {successData.credentialId} (version {successData.credentialVersion})
          </p>
          <p className="hint">Resolver cutover: NO. Channel READY is not claimed.</p>
        </div>
      ) : null}

      {phase === "error" && errorMessage ? (
        <p className="hint channel-settings-meta-activation-error" data-testid="meta-activation-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {phase === "completed_blocked" && successData ? (
        <div className="channel-settings-meta-activation-partial" data-testid="meta-activation-partial" role="status">
          <p className="channel-settings-label">Activation completed with follow-up required</p>
          <p>State: {successData.state}</p>
          <p className="hint">Resolver cutover: NO.</p>
        </div>
      ) : null}
    </section>
  );
}
