"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FacebookPageSelector } from "./FacebookPageSelector.js";
import { FacebookReconnectBanner } from "./FacebookReconnectBanner.js";
import {
  buildFacebookCompleteBody,
  classifyFacebookConnectHttpStatus,
  deferredHealthPresentationPatch,
  deriveFacebookConnectPresentationState,
  FACEBOOK_CONNECT_API,
  FACEBOOK_HEALTH_DEFERRED_COPY,
  FACEBOOK_OAUTH_ERROR_MESSAGES,
  FACEBOOK_OAUTH_OPEN_AUTHORIZATION_LABEL,
  FACEBOOK_OAUTH_REDIRECT_BLOCKED_COPY,
  FACEBOOK_OAUTH_REDIRECT_PENDING_COPY,
  FACEBOOK_OAUTH_START_FAILED_COPY,
  FACEBOOK_OAUTH_UNAVAILABLE_COPY,
  FACEBOOK_RECONNECT_DEFERRED_COPY,
  FACEBOOK_STATUS_LOAD_RETRY_COPY,
  assignFacebookOAuthAuthorizeUrl,
  facebookConnectFetch,
  facebookConnectStatusCssClass,
  facebookConnectStatusLabel,
  mapFacebookOAuthErrorCategory,
  parseFacebookCompleteResponse,
  parseFacebookConnectStatusResponse,
  parseFacebookHealthResponse,
  parseFacebookOAuthSessionResponse,
  parseFacebookOAuthStartAuthorizeUrl,
  parseFacebookPagesResponse,
  parseFacebookReconnectDeferredMessage,
  readFacebookOAuthQueryParams,
  sanitizeFacebookConnectMessage,
  stripFacebookOAuthQueryParams,
  allReadinessChecksPass,
  type FacebookConnectDisplayState,
  type FacebookConnectFetchSession,
  type FacebookConnectHealthResult,
  type FacebookConnectStatus,
  type FacebookPageOption,
  type HealthCheck
} from "./facebookConnectModel.js";

type FacebookConnectCardProps = {
  session: FacebookConnectFetchSession;
  tenantId: string;
  manualConfigured: boolean;
  disabled: boolean;
};

function defaultStatus(manualConfigured: boolean): FacebookConnectStatus {
  return {
    connectionId: null,
    connectionStatus: null,
    displayState: manualConfigured ? "MANUAL_CONFIGURED" : "NOT_CONNECTED",
    oauthStage: null,
    healthStatus: "UNKNOWN",
    reconnectRequired: false,
    providerPageId: null,
    providerPageName: null,
    manualConfigured,
    oauthAvailable: false,
    lastCheckedAt: null,
    lastVerifiedAt: null,
    errorCategory: null,
    message: null,
    credentialState: { pageAccessToken: "EMPTY" }
  };
}

export function FacebookConnectCard({
  session,
  tenantId,
  manualConfigured,
  disabled
}: FacebookConnectCardProps) {
  const [status, setStatus] = useState<FacebookConnectStatus>(() => defaultStatus(manualConfigured));
  const [presentationState, setPresentationState] = useState<FacebookConnectDisplayState>(
    manualConfigured ? "MANUAL_CONFIGURED" : "NOT_CONNECTED"
  );
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [healthResult, setHealthResult] = useState<FacebookConnectHealthResult | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [statusLoadFailed, setStatusLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAuthorizeUrl, setPendingAuthorizeUrl] = useState<string | null>(null);
  const oauthCallbackHandled = useRef(false);

  const applyStatus = useCallback(
    (next: FacebookConnectStatus) => {
      setStatus(next);
      if (next.displayState !== "CONNECTING") {
        setPendingAuthorizeUrl(null);
      }
      setPresentationState(
        deriveFacebookConnectPresentationState({
          serverDisplayState: next.displayState,
          connectionStatus: next.connectionStatus,
          oauthStage: next.oauthStage,
          healthStatus: next.healthStatus,
          reconnectRequired: next.reconnectRequired,
          manualConfigured: next.manualConfigured || manualConfigured,
          errorCategory: next.errorCategory
        })
      );
    },
    [manualConfigured]
  );

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    setStatusLoadFailed(false);
    try {
      const { res, body } = await facebookConnectFetch(session, tenantId, FACEBOOK_CONNECT_API.status);
      const outcome = classifyFacebookConnectHttpStatus(res.status);
      if (outcome === "auth_failure") {
        setStatusLoaded(false);
        setStatusLoadFailed(true);
        setLoadError(FACEBOOK_STATUS_LOAD_RETRY_COPY);
        return;
      }
      if (outcome === "unexpected_failure") {
        setStatusLoaded(false);
        setStatusLoadFailed(true);
        setLoadError(FACEBOOK_STATUS_LOAD_RETRY_COPY);
        return;
      }
      const parsed = parseFacebookConnectStatusResponse(body);
      if (!parsed.ok) {
        setStatusLoaded(false);
        setStatusLoadFailed(true);
        setLoadError(FACEBOOK_STATUS_LOAD_RETRY_COPY);
        return;
      }
      setStatusLoaded(true);
      setStatusLoadFailed(false);
      applyStatus({ ...parsed.data, manualConfigured: parsed.data.manualConfigured || manualConfigured });
    } catch {
      setStatusLoaded(false);
      setStatusLoadFailed(true);
      setLoadError(FACEBOOK_STATUS_LOAD_RETRY_COPY);
    }
  }, [applyStatus, manualConfigured, session, tenantId]);

  const loadPages = useCallback(async () => {
    const { res, body } = await facebookConnectFetch(session, tenantId, FACEBOOK_CONNECT_API.pages);
    if (!res.ok) return;
    const parsed = parseFacebookPagesResponse(body);
    if (parsed.ok) setPages(parsed.data);
  }, [session, tenantId]);

  const handleOAuthCallback = useCallback(async () => {
    if (typeof window === "undefined" || oauthCallbackHandled.current) return;
    const url = new URL(window.location.href);
    const query = readFacebookOAuthQueryParams(
      url.search,
      url.searchParams.get("channel"),
      url.searchParams.get("oauth"),
      url.searchParams.get("errorCategory")
    );
    if (query.channel !== "facebook" || !query.oauth) return;
    oauthCallbackHandled.current = true;

    if (query.oauth === "error") {
      const mapped = mapFacebookOAuthErrorCategory(query.errorCategory);
      setBannerMessage(mapped.message);
      setPresentationState("ERROR");
      window.history.replaceState({}, "", stripFacebookOAuthQueryParams(url));
      return;
    }

    if (query.oauth === "success") {
      setOauthBusy(true);
      try {
        const { res, body } = await facebookConnectFetch(
          session,
          tenantId,
          FACEBOOK_CONNECT_API.oauthSession
        );
        window.history.replaceState({}, "", stripFacebookOAuthQueryParams(url));
        if (!res.ok) {
          setBannerMessage(FACEBOOK_OAUTH_ERROR_MESSAGES.SESSION_EXPIRED);
          setPresentationState("ERROR");
          return;
        }
        const parsed = parseFacebookOAuthSessionResponse(body);
        if (!parsed.ok) {
          setBannerMessage(parsed.error);
          setPresentationState("ERROR");
          return;
        }
        setPresentationState(
          parsed.data.displayState === "CONNECTED" ? "AWAITING_PAGE_SELECTION" : parsed.data.displayState
        );
        if (parsed.data.message) setBannerMessage(parsed.data.message);
        if (parsed.data.pagesReady) {
          await loadPages();
        }
      } finally {
        setOauthBusy(false);
      }
    }
  }, [loadPages, session, tenantId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void handleOAuthCallback();
  }, [handleOAuthCallback]);

  useEffect(() => {
    applyStatus({ ...status, manualConfigured });
  }, [manualConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (presentationState === "AWAITING_PAGE_SELECTION") {
      void loadPages();
    }
  }, [presentationState, loadPages]);

  async function startOAuth(reconnect: boolean) {
    if (!status.oauthAvailable || oauthBusy || disabled) return;
    setOauthBusy(true);
    setBannerMessage(null);
    setPendingAuthorizeUrl(null);
    if (!reconnect) {
      setPresentationState("CONNECTING");
    }
    try {
      const path = reconnect ? FACEBOOK_CONNECT_API.reconnect : FACEBOOK_CONNECT_API.oauthStart;
      const { res, body } = await facebookConnectFetch(session, tenantId, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reconnect ? { reconnect: true } : {})
      });
      const outcome = classifyFacebookConnectHttpStatus(res.status);
      if (reconnect && outcome === "deferred_capability") {
        setHealthChecks([]);
        setHealthResult(null);
        applyStatus(deferredHealthPresentationPatch(status, manualConfigured));
        setPresentationState("CONNECTING");
        setBannerMessage(parseFacebookReconnectDeferredMessage(body));
        return;
      }
      if (outcome !== "success") {
        setBannerMessage(
          reconnect
            ? "Could not reconnect Facebook. Try again or use manual setup."
            : FACEBOOK_OAUTH_START_FAILED_COPY
        );
        setPresentationState(
          status.oauthStage === "COMPLETED"
            ? "CONNECTING"
            : deriveFacebookConnectPresentationState({ manualConfigured, serverDisplayState: status.displayState })
        );
        void loadStatus();
        return;
      }
      const parsedStart = parseFacebookOAuthStartAuthorizeUrl(body);
      if (!parsedStart.ok) {
        setBannerMessage(parsedStart.error);
        setPresentationState(deriveFacebookConnectPresentationState({ manualConfigured }));
        void loadStatus();
        return;
      }
      setPendingAuthorizeUrl(parsedStart.authorizeUrl);
      const redirected = assignFacebookOAuthAuthorizeUrl(parsedStart.authorizeUrl);
      setBannerMessage(
        redirected ? FACEBOOK_OAUTH_REDIRECT_PENDING_COPY : FACEBOOK_OAUTH_REDIRECT_BLOCKED_COPY
      );
      // Keep CONNECTING + fallback link visible if the browser blocks or delays navigation.
    } catch {
      setBannerMessage(
        reconnect
          ? "Could not reconnect Facebook. Try again or use manual setup."
          : FACEBOOK_OAUTH_START_FAILED_COPY
      );
      setPendingAuthorizeUrl(null);
      setPresentationState(
        status.oauthStage === "COMPLETED"
          ? "CONNECTING"
          : deriveFacebookConnectPresentationState({ manualConfigured })
      );
      void loadStatus();
    } finally {
      setOauthBusy(false);
    }
  }

  async function confirmPage() {
    if (!selectedPageId || oauthBusy || disabled) return;
    setOauthBusy(true);
    setBannerMessage(null);
    setHealthChecks([]);
    setHealthResult(null);
    try {
      const { res, body } = await facebookConnectFetch(session, tenantId, FACEBOOK_CONNECT_API.complete, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFacebookCompleteBody(selectedPageId))
      });
      if (!res.ok) {
        setBannerMessage("Could not complete Page selection. Try again.");
        return;
      }
      const parsed = parseFacebookCompleteResponse(body);
      if (!parsed.ok) {
        setBannerMessage(parsed.error);
        return;
      }
      applyStatus({
        ...status,
        connectionId: parsed.data.connectionId,
        connectionStatus: parsed.data.connectionStatus,
        oauthStage: parsed.data.oauthStage,
        healthStatus: parsed.data.healthStatus,
        displayState: parsed.data.displayState,
        reconnectRequired: false,
        providerPageId: parsed.data.providerPageId,
        providerPageName: parsed.data.providerPageName,
        message: parsed.data.message,
        manualConfigured
      });
      setPages([]);
      setSelectedPageId(null);
    } catch {
      setBannerMessage("Could not complete Page selection. Try again.");
    } finally {
      setOauthBusy(false);
    }
  }

  async function runValidation() {
    if (validationBusy || disabled) return;
    setValidationBusy(true);
    setBannerMessage(null);
    try {
      const { res, body } = await facebookConnectFetch(session, tenantId, FACEBOOK_CONNECT_API.health, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const outcome = classifyFacebookConnectHttpStatus(res.status);
      if (outcome === "deferred_capability") {
        setHealthChecks([]);
        setHealthResult(null);
        applyStatus(deferredHealthPresentationPatch(status, manualConfigured));
        setPresentationState("CONNECTING");
        const parsed = parseFacebookHealthResponse(body);
        const deferredMessage =
          parsed.ok && parsed.data.message
            ? parsed.data.message
            : FACEBOOK_HEALTH_DEFERRED_COPY;
        setBannerMessage(deferredMessage);
        return;
      }
      if (outcome !== "success") {
        setBannerMessage("Validation failed. Try again or use manual setup.");
        return;
      }
      const parsed = parseFacebookHealthResponse(body);
      if (!parsed.ok) {
        setBannerMessage(FACEBOOK_STATUS_LOAD_RETRY_COPY);
        return;
      }
      if (
        parsed.data.displayState === "CONNECTED" &&
        !allReadinessChecksPass(parsed.data.checks)
      ) {
        setHealthChecks([]);
        setHealthResult(null);
        applyStatus(deferredHealthPresentationPatch(status, manualConfigured));
        setPresentationState("CONNECTING");
        setBannerMessage(FACEBOOK_HEALTH_DEFERRED_COPY);
        return;
      }
      setHealthResult(parsed.data);
      setHealthChecks(parsed.data.checks);
      applyStatus({
        ...status,
        connectionStatus: parsed.data.connectionStatus,
        healthStatus: parsed.data.healthStatus,
        displayState: parsed.data.displayState,
        reconnectRequired: parsed.data.reconnectRequired,
        message: parsed.data.message,
        manualConfigured
      });
      if (parsed.data.message) {
        setBannerMessage(sanitizeFacebookConnectMessage(parsed.data.message));
      }
    } catch {
      setBannerMessage("Validation failed. Try again or use manual setup.");
    } finally {
      setValidationBusy(false);
    }
  }

  function cancelPageSelection() {
    setPages([]);
    setSelectedPageId(null);
    setPresentationState(manualConfigured ? "MANUAL_CONFIGURED" : "NOT_CONNECTED");
  }

  const showConnect =
    status.oauthAvailable &&
    (presentationState === "NOT_CONNECTED" ||
      presentationState === "MANUAL_CONFIGURED" ||
      presentationState === "ERROR");

  const showReconnect =
    status.oauthAvailable && presentationState === "NEEDS_RECONNECT";

  const showRunValidation = presentationState === "CONNECTING" && status.oauthStage === "COMPLETED";

  const showPageSelector = presentationState === "AWAITING_PAGE_SELECTION";

  // Stuck CONNECTING (AUTHORIZING without page selection / validation): allow restart.
  const showConnectingRetry =
    status.oauthAvailable &&
    presentationState === "CONNECTING" &&
    !showPageSelector &&
    !showRunValidation;

  return (
    <section
      className="channel-settings-facebook-connect"
      data-testid="facebook-connect-section"
      aria-label="Facebook assisted connection"
    >
      <div className="channel-settings-facebook-connect-head">
        <p className="channel-settings-label">Assisted connection (Meta OAuth)</p>
        <span
          className={`channel-settings-status-badge ${facebookConnectStatusCssClass(presentationState)}`}
          data-testid="facebook-connect-status"
        >
          {facebookConnectStatusLabel(presentationState)}
        </span>
      </div>

      {status.providerPageName || status.providerPageId ? (
        <p className="hint channel-settings-facebook-connect-linked-page">
          Linked Page: {status.providerPageName ?? "—"}
          {status.providerPageId ? ` (${status.providerPageId})` : ""}
        </p>
      ) : null}

      {!status.oauthAvailable && statusLoaded && !statusLoadFailed ? (
        <p className="hint channel-settings-facebook-connect-unavailable" data-testid="facebook-oauth-unavailable">
          {FACEBOOK_OAUTH_UNAVAILABLE_COPY}
        </p>
      ) : null}

      {loadError ? (
        <p
          className="hint channel-settings-facebook-connect-error"
          data-testid="facebook-connect-status-load-error"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {bannerMessage ? (
        <p className="hint channel-settings-facebook-connect-banner" data-testid="facebook-connect-banner" role="status">
          {bannerMessage}
        </p>
      ) : null}

      {showReconnect ? (
        <FacebookReconnectBanner
          message={bannerMessage}
          busy={oauthBusy}
          onReconnect={() => void startOAuth(true)}
        />
      ) : null}

      {showConnect ? (
        <button
          type="button"
          className="team-members-add-btn channel-settings-facebook-connect-start"
          data-testid="facebook-connect-start"
          disabled={disabled || oauthBusy}
          onClick={() => void startOAuth(false)}
        >
          {oauthBusy ? "Connecting…" : "Connect Facebook"}
        </button>
      ) : null}

      {showConnectingRetry ? (
        <div className="channel-settings-facebook-connect-actions" data-testid="facebook-oauth-redirect-actions">
          {pendingAuthorizeUrl ? (
            <a
              className="team-members-add-btn channel-settings-facebook-connect-start"
              data-testid="facebook-oauth-continue"
              href={pendingAuthorizeUrl}
              rel="noopener noreferrer"
            >
              {FACEBOOK_OAUTH_OPEN_AUTHORIZATION_LABEL}
            </a>
          ) : null}
          <button
            type="button"
            className="inbox-filter-btn"
            data-testid="facebook-oauth-try-again"
            disabled={disabled || oauthBusy}
            onClick={() => void startOAuth(false)}
          >
            {oauthBusy ? "Connecting…" : pendingAuthorizeUrl ? "Try again" : "Continue Connect Facebook"}
          </button>
        </div>
      ) : null}

      {showPageSelector ? (
        <FacebookPageSelector
          pages={pages}
          selectedPageId={selectedPageId}
          busy={oauthBusy || disabled}
          onSelectPage={setSelectedPageId}
          onConfirm={() => void confirmPage()}
          onCancel={cancelPageSelection}
        />
      ) : null}

      {showRunValidation ? (
        <div className="channel-settings-facebook-connect-validation" data-testid="facebook-connect-validation">
          <p className="hint">Page linked. Run validation to confirm runtime readiness before showing Connected.</p>
          <button
            type="button"
            className="team-members-add-btn"
            data-testid="facebook-run-validation"
            disabled={disabled || validationBusy}
            onClick={() => void runValidation()}
          >
            {validationBusy ? "Validating…" : "Run validation"}
          </button>
        </div>
      ) : null}

      {healthChecks.length > 0 ? (
        <ul className="channel-settings-facebook-connect-checks" data-testid="facebook-health-checks">
          {healthChecks.map((check) => (
            <li
              key={check.code}
              className={`channel-settings-facebook-connect-check channel-settings-facebook-connect-check-${check.status.toLowerCase()}`}
              data-testid={`facebook-health-check-${check.code}`}
            >
              <span className="channel-settings-facebook-connect-check-code">{check.code}</span>
              <span className="channel-settings-facebook-connect-check-status">{check.status}</span>
              <span className="channel-settings-facebook-connect-check-message">{check.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {presentationState === "CONNECTED" &&
      healthResult?.healthStatus === "OK" &&
      allReadinessChecksPass(healthResult.checks) ? (
        <p className="hint channel-settings-facebook-connect-success" data-testid="facebook-connect-ready">
          Facebook assisted connection is ready.
        </p>
      ) : null}
    </section>
  );
}
