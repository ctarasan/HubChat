"use client";

import { useCallback, useEffect, useState } from "react";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  buildChannelPatchBody,
  channelDisplayLabel,
  channelPathParam,
  CHANNEL_SETTING_ORDER,
  CHANNEL_SETTING_SECRET_KEYS,
  draftFromDto,
  mapChannelSettingsFetchError,
  parseChannelSettingPatchResponse,
  parseChannelSettingsListResponse,
  sanitizeUserFacingError,
  type ChannelDraft,
  type ChannelSettingSafeDto,
  type SupportedChannel
} from "./channelSettingsModel.js";

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
  return (me?.tenantId?.trim() || session.tenantId.trim());
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
  const [channels, setChannels] = useState<ChannelSettingSafeDto[]>([]);
  const [baselines, setBaselines] = useState<Partial<Record<SupportedChannel, ChannelSettingSafeDto>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<SupportedChannel, ChannelDraft>>>({});
  const [secretInputs, setSecretInputs] = useState<Partial<Record<SupportedChannel, Record<string, string>>>>({});
  const [clearSecretKeys, setClearSecretKeys] = useState<Partial<Record<SupportedChannel, string[]>>>({});
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveBusyChannel, setSaveBusyChannel] = useState<SupportedChannel | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const applyChannelRows = useCallback((rows: ChannelSettingSafeDto[]) => {
    setChannels(rows);
    const nextBaselines: Partial<Record<SupportedChannel, ChannelSettingSafeDto>> = {};
    const nextDrafts: Partial<Record<SupportedChannel, ChannelDraft>> = {};
    const nextClears: Partial<Record<SupportedChannel, string[]>> = {};
    for (const row of rows) {
      nextBaselines[row.channel] = row;
      nextDrafts[row.channel] = draftFromDto(row);
      nextClears[row.channel] = [];
    }
    setBaselines(nextBaselines);
    setDrafts(nextDrafts);
    setClearSecretKeys(nextClears);
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
      [channel]: { ...(prev[channel] ?? draftFromDto(baselines[channel]!)), ...patch }
    }));
  }

  function setSecretInput(channel: SupportedChannel, key: string, value: string) {
    setSecretInputs((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] ?? emptySecretInputs()), [key]: value }
    }));
  }

  function queueClearSecret(channel: SupportedChannel, key: string) {
    setClearSecretKeys((prev) => {
      const existing = prev[channel] ?? [];
      if (existing.includes(key)) return prev;
      return { ...prev, [channel]: [...existing, key] };
    });
    setSecretInputs((prev) => {
      const ch = { ...(prev[channel] ?? emptySecretInputs()) };
      delete ch[key];
      return { ...prev, [channel]: ch };
    });
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
      clearSecretKeys[channel] ?? []
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
      setDrafts((prev) => ({ ...prev, [channel]: draftFromDto(updated) }));
      setChannels((prev) => prev.map((row) => (row.channel === channel ? updated : row)));
      setSecretInputs((prev) => ({ ...prev, [channel]: emptySecretInputs() }));
      setClearSecretKeys((prev) => ({ ...prev, [channel]: [] }));
      setSaveSuccess(`${channelDisplayLabel(channel)} settings saved.`);
    } catch (e) {
      setSaveError(sanitizeUserFacingError(String(e instanceof Error ? e.message : e)));
    } finally {
      setSaveBusyChannel(null);
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
                  Store tenant channel settings for future runtime configuration. Values are saved securely and never
                  shown again after entry.
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
                const meta = row?.secretsConfigured ?? [];
                if (!draft) return null;
                const saving = saveBusyChannel === channel;
                return (
                  <article
                    key={channel}
                    className="card channel-settings-card"
                    data-testid={`channel-settings-card-${channelPathParam(channel)}`}
                  >
                    <header className="channel-settings-card-head">
                      <h3>{channelDisplayLabel(channel)}</h3>
                      <span className={`channel-badge channel-badge-${channelPathParam(channel)}`}>{channel}</span>
                    </header>

                    <label className="channel-settings-field channel-settings-toggle">
                      <span className="channel-settings-label">Enabled</span>
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        disabled={loadBusy || saving}
                        onChange={(e) => updateDraft(channel, { enabled: e.target.checked })}
                      />
                    </label>

                    <label className="channel-settings-field">
                      <span className="channel-settings-label">Display name</span>
                      <input
                        type="text"
                        value={draft.displayName}
                        disabled={loadBusy || saving}
                        autoComplete="off"
                        onChange={(e) => updateDraft(channel, { displayName: e.target.value })}
                      />
                    </label>

                    <label className="channel-settings-field">
                      <span className="channel-settings-label">Non-secret config (JSON object)</span>
                      <textarea
                        className="channel-settings-config-textarea"
                        rows={5}
                        value={draft.configJsonText}
                        disabled={loadBusy || saving}
                        spellCheck={false}
                        onChange={(e) => updateDraft(channel, { configJsonText: e.target.value })}
                      />
                    </label>

                    <div className="channel-settings-secrets">
                      <p className="channel-settings-label">Secrets (replace only — fields stay blank)</p>
                      {CHANNEL_SETTING_SECRET_KEYS[channel].map((secretKey) => {
                        const status = meta.find((m) => m.key === secretKey);
                        const configured = status?.configured ?? false;
                        const fingerprint = status?.fingerprint ?? null;
                        const pendingClear = (clearSecretKeys[channel] ?? []).includes(secretKey);
                        return (
                          <div key={secretKey} className="channel-settings-secret-row" data-testid={`secret-row-${secretKey}`}>
                            <div className="channel-settings-secret-meta">
                              <span className="channel-settings-secret-key">{secretKey}</span>
                              <span
                                className={
                                  configured
                                    ? "channel-settings-secret-badge channel-settings-secret-badge-on"
                                    : "channel-settings-secret-badge"
                                }
                                data-testid={`secret-status-${secretKey}`}
                              >
                                {configured ? "Configured" : "Not configured"}
                              </span>
                              {configured && fingerprint ? (
                                <span className="hint channel-settings-fingerprint" title="Admin hint only">
                                  fp: {fingerprint}
                                </span>
                              ) : null}
                              {pendingClear ? (
                                <span className="hint channel-settings-clear-pending">Clear on save</span>
                              ) : null}
                            </div>
                            <input
                              type="password"
                              className="channel-settings-secret-input"
                              value=""
                              placeholder="Enter new value to replace"
                              autoComplete="new-password"
                              disabled={loadBusy || saving}
                              data-testid={`secret-input-${secretKey}`}
                              onChange={(e) => setSecretInput(channel, secretKey, e.target.value)}
                            />
                            <button
                              type="button"
                              className="inbox-filter-btn channel-settings-clear-secret-btn"
                              disabled={loadBusy || saving || !configured}
                              onClick={() => queueClearSecret(channel, secretKey)}
                            >
                              Clear stored secret
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="team-members-add-btn channel-settings-save-btn"
                      data-testid={`channel-settings-save-${channelPathParam(channel)}`}
                      disabled={loadBusy || saving || saveBusyChannel !== null}
                      onClick={() => void saveChannel(channel)}
                    >
                      {saving ? "Saving…" : `Save ${channelDisplayLabel(channel)}`}
                    </button>
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
