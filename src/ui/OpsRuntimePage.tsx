"use client";

import { useCallback, useEffect, useState } from "react";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  formatCollectedAt,
  formatHealthReason,
  formatLagMs,
  healthLevelCssClass,
  healthLevelLabel,
  mapOpsFetchError,
  parseOpsRuntimeResponse,
  type OpsRuntimeData
} from "./opsRuntimeModel.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

export default function OpsRuntimePage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [runtime, setRuntime] = useState<OpsRuntimeData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadBusy, setLoadBusy] = useState(false);

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  async function apiFetch(path: string, init?: RequestInit): Promise<{ res: Response; body: unknown }> {
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) {
      throw new Error("Missing session configuration");
    }
    const res = await fetch(`${s.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        "x-tenant-id": s.tenantId,
        ...(init?.headers ?? {})
      }
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { res, body };
  }

  const loadRuntime = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meContext.role !== "ADMIN" || meError) return;
    setLoadBusy(true);
    setLoadError("");
    try {
      const { res, body } = await apiFetch("/api/ops/runtime");
      if (!res.ok) {
        setRuntime(null);
        setLoadError(mapOpsFetchError(res.status, body));
        return;
      }
      const parsed = parseOpsRuntimeResponse(body);
      if (!parsed.ok) {
        setRuntime(null);
        setLoadError(parsed.error);
        return;
      }
      setRuntime(parsed.data);
    } catch (e) {
      setRuntime(null);
      setLoadError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoadBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meContext?.role, meError]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let cancelled = false;
    setMeError("");
    (async () => {
      try {
        const { res, body } = await apiFetch("/api/me");
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(mapOpsFetchError(res.status, body));
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
    void loadRuntime();
  }, [meContext?.userId, meContext?.role, meError, loadRuntime]);

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
          <p className="hint">
            <a href="/setup" className="secondary-link">
              Advanced setup
            </a>
          </p>
        </div>
      </main>
    );
  }

  const isAdmin = Boolean(meContext && meContext.role === "ADMIN" && !meError);
  const canManageTeam = Boolean(meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN"));

  const statCards = runtime
    ? [
        {
          label: "Queue pending depth",
          value: String(runtime.queue.depth),
          hint: "Global queue_jobs PENDING count (all tenants)"
        },
        {
          label: "Queue lag",
          value: formatLagMs(runtime.queue.lagMs),
          hint: "Oldest PENDING job age"
        },
        {
          label: "Outbox pending depth",
          value: String(runtime.outbox.depth),
          hint: "Global outbox_events PENDING count"
        },
        {
          label: "Outbox lag",
          value: formatLagMs(runtime.outbox.lagMs),
          hint: "Oldest PENDING outbox event age"
        }
      ]
    : [];

  return (
    <main className="ops-runtime-root" data-testid="ops-runtime-page">
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
            <a
              href="/dashboard/ops"
              className="app-rail-nav-item app-rail-nav-item-active"
              aria-current="page"
              data-testid="nav-ops-runtime"
              title="Ops Runtime"
            >
              <span className="app-rail-nav-icon" aria-hidden="true">
                OP
              </span>
              <span className="app-rail-nav-label">Ops</span>
            </a>
          ) : null}
          <button type="button" className="app-rail-nav-item app-rail-nav-item-disabled" disabled aria-disabled="true" title="Coming soon">
            <span className="app-rail-nav-icon" aria-hidden="true">
              LD
            </span>
            <span className="app-rail-nav-label">Leads</span>
          </button>
          <button type="button" className="app-rail-nav-item app-rail-nav-item-disabled" disabled aria-disabled="true" title="Coming soon">
            <span className="app-rail-nav-icon" aria-hidden="true">
              AN
            </span>
            <span className="app-rail-nav-label">Analytics</span>
          </button>
        </nav>
        <div className="app-rail-footer">
          <button
            type="button"
            className="app-rail-footer-btn"
            data-testid="ops-runtime-sign-out"
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

      <section className="ops-runtime-main">
        {meError ? <div className="card error">{meError}</div> : null}

        {!isAdmin ? (
          <div className="card ops-runtime-access-denied" data-testid="ops-runtime-access-denied">
            <h2>Access denied</h2>
            <p className="hint">Ops Runtime shows global system queue health and is available to Admins only.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            <header className="team-members-header team-members-header-hero ops-runtime-header">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Operations</p>
                <h2>Ops Runtime</h2>
                <p className="team-members-subtitle">
                  System queue health across the platform — not tenant sales metrics or per-customer KPIs.
                </p>
                {runtime ? (
                  <p className="hint ops-runtime-collected-at" data-testid="ops-runtime-collected-at">
                    Snapshot collected: {formatCollectedAt(runtime.collectedAt)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="team-members-add-btn ops-runtime-refresh-btn"
                data-testid="ops-runtime-refresh"
                disabled={loadBusy}
                onClick={() => void loadRuntime()}
              >
                {loadBusy ? "Refreshing…" : "Refresh"}
              </button>
            </header>

            {loadError ? (
              <div className="card error" data-testid="ops-runtime-error" role="alert">
                {loadError}
              </div>
            ) : null}

            {runtime ? (
              <>
                <div
                  className={`ops-runtime-health-banner ${healthLevelCssClass(runtime.health.level)}`}
                  data-testid="ops-runtime-health-banner"
                  role="status"
                >
                  <span className="ops-runtime-health-label">Overall health</span>
                  <strong className="ops-runtime-health-value">{healthLevelLabel(runtime.health.level)}</strong>
                  <span className="hint ops-runtime-health-scope">Global operational snapshot</span>
                </div>

                {runtime.health.level !== "ok" && runtime.health.reasons.length > 0 ? (
                  <div className="card ops-runtime-reasons-card" data-testid="ops-runtime-reasons">
                    <h3 className="ops-runtime-section-title">Health signals</h3>
                    <ul className="ops-runtime-reasons-list">
                      {runtime.health.reasons.map((reason) => (
                        <li key={reason}>{formatHealthReason(reason)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="team-members-summary" aria-label="Queue and outbox metrics">
                  {statCards.map((c) => (
                    <div key={c.label} className="team-members-stat-card" data-testid="ops-runtime-stat-card">
                      <div className="team-members-stat-label">{c.label}</div>
                      <div className="team-members-stat-value">{c.value}</div>
                      <p className="team-members-stat-hint">{c.hint}</p>
                    </div>
                  ))}
                </div>

                <details className="card ops-runtime-thresholds-details">
                  <summary className="ops-runtime-thresholds-summary">Alert thresholds (read-only)</summary>
                  <dl className="ops-runtime-thresholds-dl">
                    <div>
                      <dt>Queue depth warn / critical</dt>
                      <dd>
                        {runtime.thresholds.queueDepthWarn} / {runtime.thresholds.queueDepthCritical}
                      </dd>
                    </div>
                    <div>
                      <dt>Queue lag warn / critical</dt>
                      <dd>
                        {formatLagMs(runtime.thresholds.queueLagMsWarn)} / {formatLagMs(runtime.thresholds.queueLagMsCritical)}
                      </dd>
                    </div>
                    <div>
                      <dt>Outbox depth warn / critical</dt>
                      <dd>
                        {runtime.thresholds.outboxDepthWarn} / {runtime.thresholds.outboxDepthCritical}
                      </dd>
                    </div>
                    <div>
                      <dt>Outbox lag warn / critical</dt>
                      <dd>
                        {formatLagMs(runtime.thresholds.outboxLagMsWarn)} /{" "}
                        {formatLagMs(runtime.thresholds.outboxLagMsCritical)}
                      </dd>
                    </div>
                  </dl>
                </details>
              </>
            ) : null}

            {!loadBusy && !loadError && !runtime ? (
              <p className="hint" data-testid="ops-runtime-empty">
                No runtime data loaded yet. Use Refresh.
              </p>
            ) : null}

            {loadBusy && !runtime ? (
              <div className="ops-runtime-loading" aria-live="polite" data-testid="ops-runtime-loading">
                <div className="team-members-skeleton-row" />
                <div className="team-members-skeleton-row" />
                <p className="hint team-members-loading-text">Loading ops runtime…</p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
