"use client";

import { useCallback, useEffect, useState } from "react";
import { canViewAnalyticsNav, canViewSlaPolicyNav } from "./dashboardNavAccess.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  applyTestConnectionToView,
  buildChannelPatchBody,
  buildTestConnectionFeedback,
  channelSupportsProviderMetadata,
  CHANNEL_SECRET_FIELDS,
  channelDisplayLabel,
  channelPathParam,
  metaProviderFieldLabels,
  CHANNEL_SETTING_ORDER,
  draftFromView,
  formatLastErrorDisplay,
  formatLastVerifiedDisplay,
  formatTimestamp,
  mapChannelSettingsFetchError,
  mapTestConnectionFetchError,
  parseChannelSettingPatchResponse,
  parseChannelSettingsListResponse,
  parseTestConnectionResponse,
  readSecretDraftValue,
  isPendingSecretClear,
  stateKeyForPatchKey,
  sanitizeUserFacingError,
  secretPresenceCssClass,
  secretPresenceLabel,
  secretStateForField,
  statusCssClass,
  statusDisplayLabel,
  statusHealthHint,
  testConnectionPath,
  testFeedbackCssClass,
  type ChannelDraft,
  type ChannelSettingView,
  type SecretStateKey,
  type SupportedChannel,
  type TestFeedbackVariant
} from "./channelSettingsModel.js";

type ChannelTestFeedback = {
  variant: TestFeedbackVariant;
  message: string;
};

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

function emptySecretInputs(): Record<string, string> {
  return {};
}

function resolveTenantId(me: MeContext | null, session: SessionConfig): string {
  return me?.tenantId?.trim() || session.tenantId.trim();
}

async function fetchWithTenantHeaders(
  session: SessionConfig,
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(`${session.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "x-tenant-id": tenantId,
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, body };
}

export default function ChannelSettingsPage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [channels, setChannels] = useState<ChannelSettingView[]>([]);
  const [baselines, setBaselines] = useState<Partial<Record<SupportedChannel, ChannelSettingView>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<SupportedChannel, ChannelDraft>>>({});
  const [secretInputs, setSecretInputs] = useState<Partial<Record<SupportedChannel, Record<string, string>>>>({});
  const [clearSecrets, setClearSecrets] = useState<Partial<Record<SupportedChannel, SecretStateKey[]>>>({});
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveBusyChannel, setSaveBusyChannel] = useState<SupportedChannel | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [testBusyChannel, setTestBusyChannel] = useState<SupportedChannel | null>(null);
  const [testFeedback, setTestFeedback] = useState<Partial<Record<SupportedChannel, ChannelTestFeedback>>>({});

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const applyChannelRows = useCallback((rows: ChannelSettingView[]) => {
    setChannels(rows);
    const nextBaselines: Partial<Record<SupportedChannel, ChannelSettingView>> = {};
    const nextDrafts: Partial<Record<SupportedChannel, ChannelDraft>> = {};
    const nextClears: Partial<Record<SupportedChannel, SecretStateKey[]>> = {};
    for (const row of rows) {
      nextBaselines[row.channel] = row;
      nextDrafts[row.channel] = draftFromView(row);
      nextClears[row.channel] = [];
    }
    setBaselines(nextBaselines);
    setDrafts(nextDrafts);
    setClearSecrets(nextClears);
    setSecretInputs({});
  }, []);

  const loadSettings = useCallback(async () => {
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) return;
    const me = meContext;
    if (!me || me.role !== "ADMIN" || meError) return;
    const tenantId = resolveTenantId(me, s);
    if (!tenantId) return;
    setLoadBusy(true);
    setLoadError("");
    setSaveError("");
    try {
      const { res, body } = await fetchWithTenantHeaders(s, tenantId, "/api/channel-settings");
      if (!res.ok) {
        setLoadError(sanitizeUserFacingError(mapChannelSettingsFetchError(res.status, body)));
        return;
      }
      const parsed = parseChannelSettingsListResponse(body);
      if (!parsed.ok) {
        setLoadError(parsed.error);
        return;
      }
      applyChannelRows(parsed.data);
    } catch (e) {
      setLoadError(sanitizeUserFacingError(String(e instanceof Error ? e.message : e)));
    } finally {
      setLoadBusy(false);
    }
  }, [session, meContext, meError, applyChannelRows]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let cancelled = false;
    setMeError("");
    (async () => {
      const s = session;
      if (!s || !hasRequiredSessionConfig(s)) return;
      const tenantId = s.tenantId.trim();
      if (!tenantId) return;
      try {
        const { res, body } = await fetchWithTenantHeaders(s, tenantId, "/api/me");
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(mapChannelSettingsFetchError(res.status, body));
        }
        const data = (body as { data?: MeContext })?.data;
        if (!data || typeof data.role !== "string") {
          throw new Error("Invalid /api/me response");
        }
        setMeContext(data);
      } catch (e) {
        if (!cancelled) {
          setMeContext(null);
          setMeError(`Could not load user profile: ${String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!meContext || meContext.role !== "ADMIN" || meError) return;
    void loadSettings();
  }, [meContext?.userId, meContext?.role, meError, loadSettings]);

  function updateDraft(channel: SupportedChannel, patch: Partial<ChannelDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] ?? draftFromView(baselines[channel]!)), ...patch }
    }));
  }

  function setSecretInput(channel: SupportedChannel, patchKey: string, value: string) {
    setSecretInputs((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] ?? emptySecretInputs()), [patchKey]: value }
    }));
    if (value.trim()) {
      const stateKey = stateKeyForPatchKey(channel, patchKey);
      if (!stateKey) return;
      setClearSecrets((prev) => {
        const existing = prev[channel] ?? [];
        if (!existing.includes(stateKey)) return prev;
        return { ...prev, [channel]: existing.filter((k) => k !== stateKey) };
      });
    }
  }

  function requestClearSecret(channel: SupportedChannel, patchKey: string, label: string) {
    const row = baselines[channel];
    if (!row) return;
    const field = CHANNEL_SECRET_FIELDS[channel].find((f) => f.patchKey === patchKey);
    if (!field) return;
    const presence = secretStateForField(row, field.stateKey);
    if (presence !== "SET") return;
    const confirmed = globalThis.confirm(
      `Clear stored ${label}? The secret will be removed when you save. This cannot be undone from the UI except by entering a new value.`
    );
    if (!confirmed) return;
    setClearSecrets((prev) => {
      const existing = prev[channel] ?? [];
      if (existing.includes(field.stateKey)) return prev;
      return { ...prev, [channel]: [...existing, field.stateKey] };
    });
    setSecretInputs((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] ?? emptySecretInputs()), [patchKey]: "" }
    }));
  }

  async function saveChannel(channel: SupportedChannel) {
    const baseline = baselines[channel];
    const draft = drafts[channel];
    if (!baseline || !draft) return;
    setSaveError("");
    setSaveSuccess("");
    const built = buildChannelPatchBody(
      baseline,
      draft,
      secretInputs[channel] ?? emptySecretInputs(),
      clearSecrets[channel] ?? []
    );
    if (!built.ok) {
      setSaveError(built.error);
      return;
    }
    if (built.body === null) {
      setSaveError("No changes to save.");
      return;
    }
    const s = session;
    const me = meContext;
    if (!s || !hasRequiredSessionConfig(s) || !me || me.role !== "ADMIN" || meError) {
      setSaveError("Channel Settings is available to Admins only.");
      return;
    }
    const tenantId = resolveTenantId(me, s);
    if (!tenantId) {
      setSaveError("Missing tenant context. Reload the page and try again.");
      return;
    }
    setSaveBusyChannel(channel);
    try {
      const { res, body } = await fetchWithTenantHeaders(
        s,
        tenantId,
        `/api/channel-settings/${channelPathParam(channel)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.body)
        }
      );
      if (!res.ok) {
        setSaveError(sanitizeUserFacingError(mapChannelSettingsFetchError(res.status, body)));
        return;
      }
      const parsed = parseChannelSettingPatchResponse(body);
      if (!parsed.ok) {
        setSaveError(parsed.error);
        return;
      }
      const updated = parsed.data;
      setBaselines((prev) => ({ ...prev, [channel]: updated }));
      setDrafts((prev) => ({ ...prev, [channel]: draftFromView(updated) }));
      setChannels((prev) => prev.map((row) => (row.channel === channel ? updated : row)));
      setSecretInputs((prev) => ({ ...prev, [channel]: emptySecretInputs() }));
      setClearSecrets((prev) => ({ ...prev, [channel]: [] }));
      setSaveSuccess(`${channelDisplayLabel(channel)} settings saved.`);
    } catch (e) {
      setSaveError(sanitizeUserFacingError(String(e instanceof Error ? e.message : e)));
    } finally {
      setSaveBusyChannel(null);
    }
  }

  async function testConnection(channel: SupportedChannel) {
    const s = session;
    const me = meContext;
    if (!s || !hasRequiredSessionConfig(s) || !me || me.role !== "ADMIN" || meError) return;
    const tenantId = resolveTenantId(me, s);
    if (!tenantId) return;
    setTestBusyChannel(channel);
    setTestFeedback((prev) => {
      const next = { ...prev };
      delete next[channel];
      return next;
    });
    try {
      const { res, body } = await fetchWithTenantHeaders(s, tenantId, testConnectionPath(channel), {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) {
        setTestFeedback((prev) => ({
          ...prev,
          [channel]: {
            variant: "error",
            message: sanitizeUserFacingError(mapTestConnectionFetchError(res.status, body))
          }
        }));
        return;
      }
      const parsed = parseTestConnectionResponse(body);
      if (!parsed.ok) {
        setTestFeedback((prev) => ({
          ...prev,
          [channel]: { variant: "error", message: parsed.error }
        }));
        return;
      }
      const result = parsed.data;
      const baseline = baselines[channel];
      if (baseline) {
        const updated = applyTestConnectionToView(baseline, result);
        setBaselines((prev) => ({ ...prev, [channel]: updated }));
        setChannels((prev) => prev.map((row) => (row.channel === channel ? updated : row)));
      }
      const feedback = buildTestConnectionFeedback(result);
      setTestFeedback((prev) => ({
        ...prev,
        [channel]: feedback
      }));
    } catch (e) {
      setTestFeedback((prev) => ({
        ...prev,
        [channel]: {
          variant: "error",
          message: sanitizeUserFacingError(String(e instanceof Error ? e.message : e))
        }
      }));
    } finally {
      setTestBusyChannel(null);
    }
  }

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="setup-wrapper">
        <div className="card team-members-state-card">
          <h1>Sign in to continue</h1>
          <p className="hint">Use your work email and password, or advanced setup for developer access.</p>
          <p>
            <a href="/login" className="primary-link">
              Sign in
            </a>
          </p>
        </div>
      </main>
    );
  }

  const isAdmin = Boolean(meContext && meContext.role === "ADMIN" && !meError);
  const canManageTeam = Boolean(meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN"));

  return (
    <main className="channel-settings-root" data-testid="channel-settings-page">
      <aside className="dashboard-app-rail" data-testid="dashboard-app-rail" aria-label="Application">
        <div className="app-rail-brand">
          <div className="app-rail-logo" aria-hidden="true">
            SK
          </div>
          <span className="app-rail-product">HubChat</span>
        </div>
        <nav className="app-rail-nav" aria-label="Workspace">
          <a href="/dashboard" className="app-rail-nav-item" data-testid="nav-team-inbox" title="Inbox">
            <span className="app-rail-nav-icon" aria-hidden="true">
              IN
            </span>
            <span className="app-rail-nav-label">Inbox</span>
          </a>
          {canManageTeam ? (
            <a href="/dashboard/team-members" className="app-rail-nav-item" data-testid="nav-team-members" title="Team">
              <span className="app-rail-nav-icon" aria-hidden="true">
                TM
              </span>
              <span className="app-rail-nav-label">Team</span>
            </a>
          ) : null}
          {isAdmin ? (
            <a href="/dashboard/ops" className="app-rail-nav-item" data-testid="nav-ops-runtime" title="Ops Runtime">
              <span className="app-rail-nav-icon" aria-hidden="true">
                OP
              </span>
              <span className="app-rail-nav-label">Ops</span>
            </a>
          ) : null}
          <a href="/dashboard/leads" className="app-rail-nav-item" data-testid="nav-leads" title="Leads">
            <span className="app-rail-nav-icon" aria-hidden="true">
              LD
            </span>
            <span className="app-rail-nav-label">Leads</span>
          </a>
          {canViewSlaPolicyNav(meContext?.role) ? (
            <a href="/dashboard/sla-policy" className="app-rail-nav-item" data-testid="nav-sla-policy" title="SLA Policy">
              <span className="app-rail-nav-icon" aria-hidden="true">
                SLA
              </span>
              <span className="app-rail-nav-label">SLA</span>
            </a>
          ) : null}
          {canViewAnalyticsNav(meContext?.role) ? (
            <a href="/dashboard/analytics" className="app-rail-nav-item" data-testid="nav-analytics" title="Analytics">
              <span className="app-rail-nav-icon" aria-hidden="true">
                AN
              </span>
              <span className="app-rail-nav-label">Analytics</span>
            </a>
          ) : null}
          {isAdmin ? (
            <a
              href="/dashboard/channel-settings"
              className="app-rail-nav-item app-rail-nav-item-active"
              aria-current="page"
              data-testid="nav-channel-settings"
              title="Channel Settings"
            >
              <span className="app-rail-nav-icon" aria-hidden="true">
                CH
              </span>
              <span className="app-rail-nav-label">Channels</span>
            </a>
          ) : null}
        </nav>
        <div className="app-rail-footer">
          <button
            type="button"
            className="app-rail-footer-btn"
            data-testid="channel-settings-sign-out"
            title="Sign out"
            onClick={() => {
              clearSessionConfig(globalThis.localStorage);
              window.location.replace("/login");
            }}
          >
            <span className="app-rail-nav-icon" aria-hidden="true">
              Out
            </span>
            <span className="app-rail-nav-label">Out</span>
          </button>
          <a href="/setup" className="app-rail-footer-link" title="Setup">
            Setup
          </a>
        </div>
      </aside>

      <section className="channel-settings-main">
        {meError ? <div className="card error">{meError}</div> : null}

        {!isAdmin ? (
          <div className="card channel-settings-access-denied" data-testid="channel-settings-access-denied">
            <h2>Access denied</h2>
            <p className="hint">Channel Settings is available to Admins only.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            <header className="team-members-header team-members-header-hero channel-settings-header">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Configuration</p>
                <h2>Channel Settings</h2>
                <p className="team-members-subtitle">
                  Provider secrets are write-only and are never shown after save. Use status and SET/EMPTY badges to see
                  what is stored.
                </p>
                <p className="hint channel-settings-runtime-note">
                  Current production runtime may still use environment configuration until runtime cutover is completed.
                </p>
              </div>
              <button
                type="button"
                className="team-members-add-btn channel-settings-reload-btn"
                data-testid="channel-settings-reload"
                disabled={loadBusy || saveBusyChannel !== null}
                onClick={() => void loadSettings()}
              >
                {loadBusy ? "Loading…" : "Reload"}
              </button>
            </header>

            {loadError ? (
              <div className="card error" data-testid="channel-settings-load-error" role="alert">
                {loadError}
              </div>
            ) : null}
            {saveError ? (
              <div className="card error" data-testid="channel-settings-save-error" role="alert">
                {saveError}
              </div>
            ) : null}
            {saveSuccess ? (
              <div className="card success channel-settings-save-success" data-testid="channel-settings-save-success" role="status">
                {saveSuccess}
              </div>
            ) : null}

            {loadBusy && channels.length === 0 ? (
              <div className="channel-settings-loading" data-testid="channel-settings-loading" aria-live="polite">
                <div className="team-members-skeleton-row" />
                <p className="hint">Loading channel settings…</p>
              </div>
            ) : null}

            <div className="channel-settings-grid" aria-label="Channel settings by provider">
              {CHANNEL_SETTING_ORDER.map((channel) => {
                const row = channels.find((c) => c.channel === channel);
                const draft = drafts[channel];
                if (!draft || !row) return null;
                const saving = saveBusyChannel === channel;
                const testing = testBusyChannel === channel;
                const feedback = testFeedback[channel];
                const healthHint = statusHealthHint(row.status);
                const providerLabels = metaProviderFieldLabels(channel);
                const showProviderFields = channelSupportsProviderMetadata(channel) && providerLabels;
                return (
                  <article
                    key={channel}
                    className="card channel-settings-card"
                    data-testid={`channel-settings-card-${channelPathParam(channel)}`}
                  >
                    <header className="channel-settings-card-head">
                      <h3>{channelDisplayLabel(channel)}</h3>
                      <div className="channel-settings-card-badges">
                        <span className={`channel-badge channel-badge-${channelPathParam(channel)}`}>{channel}</span>
                        <span
                          className={statusCssClass(row.status)}
                          data-testid={`channel-status-${channelPathParam(channel)}`}
                        >
                          {statusDisplayLabel(row.status)}
                        </span>
                      </div>
                      {healthHint ? (
                        <p className="hint channel-settings-health-hint" data-testid={`channel-health-hint-${channelPathParam(channel)}`}>
                          {healthHint}
                        </p>
                      ) : null}
                    </header>

                    <dl className="channel-settings-meta">
                      <div className="channel-settings-meta-row">
                        <dt>Configured</dt>
                        <dd data-testid={`channel-configured-${channelPathParam(channel)}`}>
                          {row.configured ? "Yes" : "No"}
                        </dd>
                      </div>
                      {!showProviderFields && row.providerPageId ? (
                        <div className="channel-settings-meta-row">
                          <dt>Page ID</dt>
                          <dd>{row.providerPageId}</dd>
                        </div>
                      ) : null}
                      {!showProviderFields && row.providerAccountName ? (
                        <div className="channel-settings-meta-row">
                          <dt>Account</dt>
                          <dd>{row.providerAccountName}</dd>
                        </div>
                      ) : !showProviderFields && row.legacyDisplayName ? (
                        <div className="channel-settings-meta-row">
                          <dt>Display name</dt>
                          <dd data-testid={`channel-legacy-display-name-${channelPathParam(channel)}`}>
                            {row.legacyDisplayName}
                          </dd>
                        </div>
                      ) : null}
                      {row.legacyConfigJson && Object.keys(row.legacyConfigJson).length > 0 ? (
                        <div className="channel-settings-meta-row">
                          <dt>Config</dt>
                          <dd className="hint">Non-secret config stored ({Object.keys(row.legacyConfigJson).length} keys)</dd>
                        </div>
                      ) : null}
                      <div className="channel-settings-meta-row">
                        <dt>Last verified</dt>
                        <dd data-testid={`channel-last-verified-${channelPathParam(channel)}`}>
                          {formatLastVerifiedDisplay(row.lastVerifiedAt)}
                        </dd>
                      </div>
                      <div className="channel-settings-meta-row">
                        <dt>Updated</dt>
                        <dd>{formatTimestamp(row.updatedAt)}</dd>
                      </div>
                      <div
                        className={`channel-settings-meta-row${row.lastError ? " channel-settings-meta-error" : ""}`}
                      >
                        <dt>Last error</dt>
                        <dd data-testid={`channel-last-error-${channelPathParam(channel)}`}>
                          {formatLastErrorDisplay(row.lastError)}
                        </dd>
                      </div>
                    </dl>

                    {feedback ? (
                      <div
                        className={testFeedbackCssClass(feedback.variant)}
                        data-testid={`channel-test-feedback-${channelPathParam(channel)}`}
                        role="status"
                      >
                        {feedback.message}
                      </div>
                    ) : null}

                    <label className="channel-settings-field channel-settings-toggle">
                      <span className="channel-settings-label">Enabled</span>
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        disabled={loadBusy || saving || testing}
                        onChange={(e) => updateDraft(channel, { enabled: e.target.checked })}
                      />
                    </label>

                    {showProviderFields ? (
                      <div
                        className="channel-settings-provider"
                        data-testid={`channel-provider-fields-${channelPathParam(channel)}`}
                      >
                        <p className="channel-settings-label">Provider metadata</p>
                        <label className="channel-settings-field">
                          <span className="channel-settings-provider-label">{providerLabels.pageIdLabel}</span>
                          <input
                            type="text"
                            className="channel-settings-provider-input"
                            value={draft.providerPageId}
                            placeholder="e.g. 1137356672785125"
                            autoComplete="off"
                            disabled={loadBusy || saving || testing}
                            data-testid={`channel-provider-page-id-${channelPathParam(channel)}`}
                            onChange={(e) => updateDraft(channel, { providerPageId: e.target.value })}
                          />
                          <span className="hint channel-settings-provider-hint">{providerLabels.pageIdHint}</span>
                        </label>
                        <label className="channel-settings-field">
                          <span className="channel-settings-provider-label">
                            {providerLabels.accountNameLabel}
                          </span>
                          <input
                            type="text"
                            className="channel-settings-provider-input"
                            value={draft.providerAccountName}
                            placeholder="e.g. Main Facebook Page"
                            autoComplete="off"
                            disabled={loadBusy || saving || testing}
                            data-testid={`channel-provider-account-name-${channelPathParam(channel)}`}
                            onChange={(e) => updateDraft(channel, { providerAccountName: e.target.value })}
                          />
                          <span className="hint channel-settings-provider-hint">
                            {providerLabels.accountNameHint}
                          </span>
                        </label>
                      </div>
                    ) : null}

                    <div className="channel-settings-secrets">
                      <p className="channel-settings-label">Provider secrets (write-only)</p>
                      <p className="hint channel-settings-secret-hint">
                        Leave blank to keep existing secret. Enter a value only to replace. Clear requires confirmation
                        and Save.
                      </p>
                      {CHANNEL_SECRET_FIELDS[channel].map((field) => {
                        const presence = secretStateForField(row, field.stateKey);
                        const pendingClear = isPendingSecretClear(
                          clearSecrets[channel],
                          field.stateKey,
                          secretInputs[channel],
                          field.patchKey
                        );
                        return (
                          <div
                            key={field.patchKey}
                            className="channel-settings-secret-row"
                            data-testid={`secret-row-${field.patchKey}`}
                          >
                            <div className="channel-settings-secret-meta">
                              <span className="channel-settings-secret-key">{field.label}</span>
                              <span
                                className={secretPresenceCssClass(presence)}
                                data-testid={`secret-state-${field.patchKey}`}
                              >
                                {secretPresenceLabel(presence)}
                              </span>
                              {pendingClear ? (
                                <span className="hint channel-settings-clear-pending">Clear on save</span>
                              ) : null}
                            </div>
                            <input
                              type="password"
                              className="channel-settings-secret-input"
                              value={readSecretDraftValue(secretInputs[channel], field.patchKey)}
                              placeholder="Leave blank to keep existing secret"
                              autoComplete="new-password"
                              disabled={loadBusy || saving || testing}
                              data-testid={`secret-input-${field.patchKey}`}
                              onChange={(e) => setSecretInput(channel, field.patchKey, e.target.value)}
                            />
                            <button
                              type="button"
                              className="inbox-filter-btn channel-settings-clear-secret-btn"
                              disabled={loadBusy || saving || testing || presence !== "SET"}
                              data-testid={`secret-clear-${field.patchKey}`}
                              onClick={() => requestClearSecret(channel, field.patchKey, field.label)}
                            >
                              Clear stored secret
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="channel-settings-card-actions">
                      <button
                        type="button"
                        className="inbox-filter-btn channel-settings-test-btn"
                        data-testid={`channel-test-connection-${channelPathParam(channel)}`}
                        disabled={loadBusy || saving || testing}
                        onClick={() => void testConnection(channel)}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </button>
                      <button
                        type="button"
                        className="team-members-add-btn channel-settings-save-btn"
                        data-testid={`channel-settings-save-${channelPathParam(channel)}`}
                        disabled={loadBusy || saving || testing || saveBusyChannel !== null}
                        onClick={() => void saveChannel(channel)}
                      >
                        {saving ? "Saving…" : `Save ${channelDisplayLabel(channel)}`}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
