"use client";

import { useCallback, useEffect, useState } from "react";
import { canViewAnalyticsNav, canViewSlaPolicyNav } from "./dashboardNavAccess.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  formatCollectedAt,
  formatHealthReason,
  formatLagMs,
  healthLevelCssClass,
  healthLevelLabel,
  isDeadLetterReason,
  isPendingBacklogReason,
  isStaleProcessingReason,
  mapOpsFetchError,
  parseOpsRuntimeResponse,
  type OpsRuntimeData,
  type OpsRuntimeLifecycleCounts
} from "./opsRuntimeModel.js";
import {
  formatRetentionDryRunGeneratedAt,
  formatRetentionSampleCell,
  mapRetentionDryRunFetchError,
  parseRetentionDryRunResponse,
  retentionSampleColumnKeys,
  retentionSampleColumnLabel,
  type RetentionDryRunReport,
  type RetentionDryRunSampleRow
} from "./retentionDryRunModel.js";
import {
  RETENTION_EXECUTE_CONFIRM_PHRASE,
  buildRetentionPurgeRunSnapshotBody,
  buildRetentionRawPayloadExecuteBody,
  canExecuteRawPayloadForRun,
  formatRetentionPurgeRunCreatedAt,
  formatRetentionPurgeRunStatus,
  formatRetentionRawPayloadExecuteResult,
  isRetentionExecuteConfirmValid,
  mapRetentionPurgeRunSaveError,
  mapRetentionPurgeRunsFetchError,
  mapRetentionRawPayloadExecuteError,
  parseRetentionPurgeRunCreateResponse,
  parseRetentionPurgeRunsListResponse,
  parseRetentionRawPayloadExecuteResponse,
  type RetentionPurgeRunRecord,
  type RetentionPurgeRunsListMeta,
  type RetentionRawPayloadExecuteResult
} from "./retentionPurgeRunModel.js";

function lifecycleStatRows(
  label: string,
  counts: OpsRuntimeLifecycleCounts,
  testId: string
): { label: string; value: string; hint: string; testId: string }[] {
  return [
    {
      label: `${label} pending`,
      value: String(counts.pending),
      hint: "Waiting for worker claim (queue work only)",
      testId: `${testId}-pending`
    },
    {
      label: `${label} processing`,
      value: String(counts.processing),
      hint: "Currently claimed by worker",
      testId: `${testId}-processing`
    },
    {
      label: `${label} stale processing`,
      value: String(counts.processingStale),
      hint: "Possible stuck/crashed worker (past reclaim threshold)",
      testId: `${testId}-stale`
    },
    {
      label: `${label} dead letter`,
      value: String(counts.deadLetter),
      hint: "Historical failed jobs; compare baseline/delta and inspect logs if increasing",
      testId: `${testId}-dead-letter`
    }
  ];
}

function RetentionDryRunSampleTable({
  title,
  rows,
  testId
}: {
  title: string;
  rows: RetentionDryRunSampleRow[];
  testId: string;
}) {
  const columns = retentionSampleColumnKeys(rows);
  return (
    <div className="ops-retention-sample-block" data-testid={testId}>
      <h4 className="ops-retention-sample-title">{title}</h4>
      {rows.length === 0 ? (
        <p className="hint" data-testid={`${testId}-empty`}>
          No sample rows in this dry-run.
        </p>
      ) : (
        <div className="ops-retention-table-scroll">
          <table className="ops-retention-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{retentionSampleColumnLabel(col)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${testId}-row-${idx}`} data-testid={`${testId}-row`}>
                  {columns.map((col) => (
                    <td key={col}>{formatRetentionSampleCell(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RetentionPurgeRunHistoryItem({
  run,
  executionMeta,
  executeApiUnavailable,
  purgeRunsUnavailable,
  onExecuteRawPayload
}: {
  run: RetentionPurgeRunRecord;
  executionMeta: RetentionPurgeRunsListMeta;
  executeApiUnavailable: boolean;
  purgeRunsUnavailable: boolean;
  onExecuteRawPayload: (
    runId: string,
    confirmText: string
  ) => Promise<{ ok: true; result: RetentionRawPayloadExecuteResult } | { ok: false; error: string }>;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [executeBusy, setExecuteBusy] = useState(false);
  const [executeError, setExecuteError] = useState("");
  const [executeResult, setExecuteResult] = useState<RetentionRawPayloadExecuteResult | null>(null);

  const executionAllowed = canExecuteRawPayloadForRun(run, executionMeta);
  const confirmValid = isRetentionExecuteConfirmValid(confirmText);
  const showExecutePanel = !purgeRunsUnavailable;

  async function handleExecute() {
    if (!confirmValid || !executionAllowed || executeApiUnavailable || executeBusy) return;
    setExecuteBusy(true);
    setExecuteError("");
    setExecuteResult(null);
    const outcome = await onExecuteRawPayload(run.id, confirmText);
    setExecuteBusy(false);
    if (!outcome.ok) {
      setExecuteError(outcome.error);
      return;
    }
    setExecuteResult(outcome.result);
    setConfirmText("");
  }

  return (
    <article className="ops-retention-run-card" data-testid={`ops-retention-run-${run.id}`}>
      <header className="ops-retention-run-head">
        <span className="inbox-badge ops-retention-run-status">{formatRetentionPurgeRunStatus(run.status)}</span>
        <time className="hint ops-retention-run-time" dateTime={run.createdAt}>
          {formatRetentionPurgeRunCreatedAt(run.createdAt)}
        </time>
      </header>
      {run.notes ? (
        <p className="hint ops-retention-run-notes" data-testid={`ops-retention-run-notes-${run.id}`}>
          {run.notes}
        </p>
      ) : null}
      <dl className="ops-retention-run-snapshot-dl">
        <div>
          <dt>Media retention (days)</dt>
          <dd>{run.policy.archivedMediaRetentionDays}</dd>
        </div>
        <div>
          <dt>Message retention (days)</dt>
          <dd>{run.policy.archivedMessageRetentionDays}</dd>
        </div>
        <div>
          <dt>Raw payload retention (days)</dt>
          <dd>{run.policy.rawPayloadRetentionDays}</dd>
        </div>
        <div>
          <dt>Media purge candidates</dt>
          <dd>{run.summary.mediaPurgeCandidates}</dd>
        </div>
        <div>
          <dt>Message purge candidates</dt>
          <dd>{run.summary.messageHistoryPurgeCandidates}</dd>
        </div>
        <div>
          <dt>Est. messages eligible</dt>
          <dd>{run.summary.estimatedMessagesEligible}</dd>
        </div>
        <div>
          <dt>Est. media attachments eligible</dt>
          <dd>{run.summary.estimatedMediaAttachmentsEligible}</dd>
        </div>
        {run.summary.rawPayloadCandidates !== null ? (
          <div>
            <dt>Raw payload candidates</dt>
            <dd>{run.summary.rawPayloadCandidates}</dd>
          </div>
        ) : null}
      </dl>
      {showExecutePanel ? (
        <div
          className="ops-retention-execute-panel"
          data-testid={`ops-retention-execute-panel-${run.id}`}
        >
          <p className="ops-retention-execute-warning" data-testid={`ops-retention-execute-warning-${run.id}`}>
            Manual raw payload cleanup only. Media files and message history will not be purged.
          </p>
          {executeApiUnavailable ? (
            <p className="hint" data-testid={`ops-retention-execute-unavailable-${run.id}`} role="status">
              Retention execute API is not available yet. Raw payload cleanup will work when{" "}
              <code>POST /api/retention/purge-runs/[id]/execute</code> is deployed.
            </p>
          ) : null}
          {!executionAllowed && !executeApiUnavailable ? (
            <p className="hint" data-testid={`ops-retention-execute-disabled-${run.id}`} role="status">
              Raw payload cleanup execution is disabled for this snapshot.
            </p>
          ) : null}
          <label className="ops-retention-execute-confirm-field">
            <span className="leads-filter-label">
              Type <code>{RETENTION_EXECUTE_CONFIRM_PHRASE}</code> to confirm
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={RETENTION_EXECUTE_CONFIRM_PHRASE}
              autoComplete="off"
              spellCheck={false}
              data-testid={`ops-retention-execute-confirm-${run.id}`}
            />
          </label>
          {executeError ? (
            <div
              className="error ops-retention-dry-run-error"
              data-testid={`ops-retention-execute-error-${run.id}`}
              role="alert"
            >
              {executeError}
            </div>
          ) : null}
          {executeResult ? (
            <p
              className="hint ops-retention-execute-success"
              data-testid={`ops-retention-execute-success-${run.id}`}
              role="status"
            >
              {formatRetentionRawPayloadExecuteResult(executeResult)}
            </p>
          ) : null}
          <button
            type="button"
            className="team-members-add-btn ops-retention-execute-btn"
            data-testid={`ops-retention-execute-btn-${run.id}`}
            disabled={
              executeBusy ||
              executeApiUnavailable ||
              !executionAllowed ||
              !confirmValid ||
              purgeRunsUnavailable
            }
            onClick={() => void handleExecute()}
          >
            {executeBusy ? "Executing…" : "Execute raw payload cleanup"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

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
  const [retentionReport, setRetentionReport] = useState<RetentionDryRunReport | null>(null);
  const [retentionError, setRetentionError] = useState("");
  const [retentionUnavailable, setRetentionUnavailable] = useState(false);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [purgeRuns, setPurgeRuns] = useState<RetentionPurgeRunRecord[]>([]);
  const [purgeRunsMeta, setPurgeRunsMeta] = useState<RetentionPurgeRunsListMeta>({
    rawPayloadExecutionEnabled: true
  });
  const [purgeRunsError, setPurgeRunsError] = useState("");
  const [purgeRunsUnavailable, setPurgeRunsUnavailable] = useState(false);
  const [purgeRunsBusy, setPurgeRunsBusy] = useState(false);
  const [executeApiUnavailable, setExecuteApiUnavailable] = useState(false);
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotSuccess, setSnapshotSuccess] = useState("");
  const [snapshotSaveBusy, setSnapshotSaveBusy] = useState(false);

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

  const loadRetentionDryRun = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meContext.role !== "ADMIN" || meError) return;
    setRetentionBusy(true);
    setRetentionError("");
    setRetentionUnavailable(false);
    try {
      const { res, body } = await apiFetch("/api/retention/dry-run");
      if (res.status === 404) {
        setRetentionReport(null);
        setRetentionUnavailable(true);
        setRetentionError("");
        return;
      }
      if (!res.ok) {
        setRetentionReport(null);
        setRetentionError(mapRetentionDryRunFetchError(res.status, body));
        return;
      }
      const parsed = parseRetentionDryRunResponse(body);
      if (!parsed.ok) {
        setRetentionReport(null);
        setRetentionError(parsed.error);
        return;
      }
      setRetentionReport(parsed.report);
    } catch (e) {
      setRetentionReport(null);
      setRetentionError(String(e instanceof Error ? e.message : e));
    } finally {
      setRetentionBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meContext?.role, meError]);

  const loadPurgeRuns = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meContext.role !== "ADMIN" || meError) return;
    setPurgeRunsBusy(true);
    setPurgeRunsError("");
    setPurgeRunsUnavailable(false);
    try {
      const { res, body } = await apiFetch("/api/retention/purge-runs");
      if (res.status === 404) {
        setPurgeRuns([]);
        setPurgeRunsUnavailable(true);
        return;
      }
      if (!res.ok) {
        setPurgeRuns([]);
        setPurgeRunsError(mapRetentionPurgeRunsFetchError(res.status, body));
        return;
      }
      const parsed = parseRetentionPurgeRunsListResponse(body);
      if (!parsed.ok) {
        setPurgeRuns([]);
        setPurgeRunsError(parsed.error);
        return;
      }
      setPurgeRuns(parsed.runs);
      setPurgeRunsMeta(parsed.meta);
    } catch (e) {
      setPurgeRuns([]);
      setPurgeRunsError(String(e instanceof Error ? e.message : e));
    } finally {
      setPurgeRunsBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meContext?.role, meError]);

  const executeRawPayloadCleanup = useCallback(
    async (
      runId: string,
      confirmText: string
    ): Promise<{ ok: true; result: RetentionRawPayloadExecuteResult } | { ok: false; error: string }> => {
      if (!session || !hasRequiredSessionConfig(session)) {
        return { ok: false, error: "Missing session configuration" };
      }
      if (!meContext || meContext.role !== "ADMIN" || meError) {
        return { ok: false, error: "Admin access required." };
      }
      try {
        const { res, body } = await apiFetch(
          `/api/retention/purge-runs/${encodeURIComponent(runId)}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildRetentionRawPayloadExecuteBody(confirmText))
          }
        );
        if (res.status === 404) {
          setExecuteApiUnavailable(true);
          return { ok: false, error: mapRetentionRawPayloadExecuteError(404, body) };
        }
        if (!res.ok) {
          return { ok: false, error: mapRetentionRawPayloadExecuteError(res.status, body) };
        }
        const parsed = parseRetentionRawPayloadExecuteResponse(body);
        if (!parsed.ok) {
          return { ok: false, error: parsed.error };
        }
        await loadPurgeRuns();
        return { ok: true, result: parsed.result };
      } catch (e) {
        return { ok: false, error: String(e instanceof Error ? e.message : e) };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      session?.baseUrl,
      session?.tenantId,
      session?.accessToken,
      meContext?.userId,
      meContext?.role,
      meError,
      loadPurgeRuns
    ]
  );

  const saveDryRunSnapshot = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meContext.role !== "ADMIN" || meError) return;
    if (!retentionReport || retentionUnavailable) return;
    setSnapshotSaveBusy(true);
    setSnapshotError("");
    setSnapshotSuccess("");
    try {
      const { res, body } = await apiFetch("/api/retention/purge-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRetentionPurgeRunSnapshotBody(snapshotNotes))
      });
      if (res.status === 404) {
        setPurgeRunsUnavailable(true);
        setSnapshotError(mapRetentionPurgeRunSaveError(404, body));
        return;
      }
      if (!res.ok) {
        setSnapshotError(mapRetentionPurgeRunSaveError(res.status, body));
        return;
      }
      const parsed = parseRetentionPurgeRunCreateResponse(body);
      if (!parsed.ok) {
        setSnapshotError(parsed.error);
        return;
      }
      setSnapshotSuccess("Audit snapshot saved.");
      await loadPurgeRuns();
    } catch (e) {
      setSnapshotError(String(e instanceof Error ? e.message : e));
    } finally {
      setSnapshotSaveBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session?.baseUrl,
    session?.tenantId,
    session?.accessToken,
    meContext?.userId,
    meContext?.role,
    meError,
    retentionReport,
    retentionUnavailable,
    snapshotNotes,
    loadPurgeRuns
  ]);

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
    void loadRetentionDryRun();
    void loadPurgeRuns();
  }, [meContext?.userId, meContext?.role, meError, loadRuntime, loadRetentionDryRun, loadPurgeRuns]);

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
  const healthReasons = runtime?.health.reasons ?? [];
  const hasDeadLetterOnlyWarning =
    runtime?.health.level === "warn" &&
    healthReasons.length > 0 &&
    healthReasons.every((reason) => isDeadLetterReason(reason));
  const hasStaleProcessingSignal = healthReasons.some((reason) => isStaleProcessingReason(reason));
  const hasPendingBacklogSignal = healthReasons.some((reason) => isPendingBacklogReason(reason));

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
          {isAdmin ? (
            <a
              href="/dashboard/channel-settings"
              className="app-rail-nav-item"
              data-testid="nav-channel-settings"
              title="Channel Settings"
            >
              <span className="app-rail-nav-icon" aria-hidden="true">
                CH
              </span>
              <span className="app-rail-nav-label">Channels</span>
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

                {hasDeadLetterOnlyWarning ? (
                  <div className="card ops-runtime-dead-letter-baseline-note" data-testid="ops-runtime-dead-letter-baseline-note">
                    <p className="hint">
                      This warning is driven by dead-letter counts only. Dead-letter can be historical baseline, not an active
                      outage. Compare current counts to your last known baseline and focus on deltas after a fresh smoke run.
                    </p>
                  </div>
                ) : null}

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

                <div className="card ops-runtime-triage-card" data-testid="ops-runtime-triage-hint">
                  <h3 className="ops-runtime-section-title">Operator guidance</h3>
                  <ul className="ops-runtime-reasons-list">
                    <li>Webhook accepted but Dashboard missing message: check outbox and inbound pending/stale first.</li>
                    <li>
                      If stale processing is above 0, check Railway worker <code>/ready</code> and worker logs for stuck loops.
                    </li>
                    <li>If dead-letter increases after smoke, inspect Railway logs for the newly failing path.</li>
                    <li>
                      Unread inbox badges are not queue pending. If pending/processing/stale are 0, the message is already
                      processed; open the conversation to mark read.
                    </li>
                  </ul>
                  {hasPendingBacklogSignal || hasStaleProcessingSignal ? (
                    <p className="hint" data-testid="ops-runtime-active-backlog-note">
                      Current health reasons include active backlog/stale processing. Prioritize worker processing checks before
                      inbox UI troubleshooting.
                    </p>
                  ) : null}
                  <p className="hint">
                    See <code>docs/hubchat-worker-queue-observability-runbook.md</code>.
                  </p>
                </div>

                <h3 className="ops-runtime-section-title" data-testid="ops-runtime-worker-detail-heading">
                  Worker queue detail (global)
                </h3>
                <div className="team-members-summary" aria-label="Inbound outbound and outbox lifecycle counts">
                  {[
                    ...lifecycleStatRows("Inbound queue", runtime.queueDetail.inbound, "ops-runtime-queue-inbound"),
                    ...lifecycleStatRows("Outbound queue", runtime.queueDetail.outbound, "ops-runtime-queue-outbound"),
                    ...lifecycleStatRows("Outbox", runtime.outboxDetail, "ops-runtime-outbox")
                  ].map((c) => (
                    <div key={c.testId} className="team-members-stat-card" data-testid={c.testId}>
                      <div className="team-members-stat-label">{c.label}</div>
                      <div className="team-members-stat-value">{c.value}</div>
                      <p className="team-members-stat-hint">{c.hint}</p>
                    </div>
                  ))}
                </div>
                <p className="hint ops-runtime-stale-thresholds" data-testid="ops-runtime-stale-thresholds">
                  Stale processing: queue jobs older than {runtime.processingStaleAfterSeconds.queueSeconds}s, outbox
                  events older than {runtime.processingStaleAfterSeconds.outboxSeconds}s (read-only defaults).
                </p>

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

            <section className="card ops-retention-dry-run-card" data-testid="ops-retention-dry-run">
              <div className="ops-retention-dry-run-head">
                <div>
                  <h3 className="ops-runtime-section-title">Retention dry-run</h3>
                  <p className="hint ops-retention-dry-run-disclaimer" data-testid="ops-retention-dry-run-disclaimer">
                    Dry-run only. No data will be deleted.
                  </p>
                </div>
                <button
                  type="button"
                  className="team-members-add-btn ops-runtime-refresh-btn"
                  data-testid="ops-retention-dry-run-reload"
                  disabled={retentionBusy}
                  onClick={() => void loadRetentionDryRun()}
                >
                  {retentionBusy ? "Reloading…" : "Reload"}
                </button>
              </div>

              {retentionUnavailable ? (
                <p className="hint" data-testid="ops-retention-dry-run-unavailable" role="status">
                  Retention dry-run API is not available yet. This panel will load automatically when{" "}
                  <code>GET /api/retention/dry-run</code> is deployed.
                </p>
              ) : null}

              {retentionError ? (
                <div className="error ops-retention-dry-run-error" data-testid="ops-retention-dry-run-error" role="alert">
                  {retentionError}
                </div>
              ) : null}

              {retentionReport ? (
                <>
                  <p className="hint ops-retention-generated-at" data-testid="ops-retention-dry-run-generated-at">
                    Report generated: {formatRetentionDryRunGeneratedAt(retentionReport.generatedAt)}
                  </p>

                  <dl className="ops-retention-policy-dl" data-testid="ops-retention-dry-run-policy">
                    <div>
                      <dt>Archived media retention (days)</dt>
                      <dd>{retentionReport.policy.archivedMediaRetentionDays}</dd>
                    </div>
                    <div>
                      <dt>Archived message retention (days)</dt>
                      <dd>{retentionReport.policy.archivedMessageRetentionDays}</dd>
                    </div>
                    <div>
                      <dt>Raw payload retention (days)</dt>
                      <dd>{retentionReport.policy.rawPayloadRetentionDays}</dd>
                    </div>
                  </dl>

                  <div
                    className="team-members-summary"
                    aria-label="Retention dry-run summary"
                    data-testid="ops-retention-dry-run-summary"
                  >
                    <div className="team-members-stat-card">
                      <div className="team-members-stat-label">Media purge candidates</div>
                      <div className="team-members-stat-value">{retentionReport.summary.mediaPurgeCandidates}</div>
                    </div>
                    <div className="team-members-stat-card">
                      <div className="team-members-stat-label">Message history purge candidates</div>
                      <div className="team-members-stat-value">
                        {retentionReport.summary.messageHistoryPurgeCandidates}
                      </div>
                    </div>
                    <div className="team-members-stat-card">
                      <div className="team-members-stat-label">Estimated messages eligible</div>
                      <div className="team-members-stat-value">{retentionReport.summary.estimatedMessagesEligible}</div>
                    </div>
                    <div className="team-members-stat-card">
                      <div className="team-members-stat-label">Estimated media attachments eligible</div>
                      <div className="team-members-stat-value">
                        {retentionReport.summary.estimatedMediaAttachmentsEligible}
                      </div>
                    </div>
                    {retentionReport.summary.rawPayloadCandidates !== null ? (
                      <div className="team-members-stat-card">
                        <div className="team-members-stat-label">Raw payload candidates</div>
                        <div className="team-members-stat-value">{retentionReport.summary.rawPayloadCandidates}</div>
                      </div>
                    ) : null}
                  </div>

                  <RetentionDryRunSampleTable
                    title="Media purge candidates (sample)"
                    rows={retentionReport.samples.mediaPurgeCandidates}
                    testId="ops-retention-media-samples"
                  />
                  <RetentionDryRunSampleTable
                    title="Message purge candidates (sample)"
                    rows={retentionReport.samples.messagePurgeCandidates}
                    testId="ops-retention-message-samples"
                  />
                </>
              ) : null}

              {retentionBusy && !retentionReport && !retentionUnavailable && !retentionError ? (
                <p className="hint" data-testid="ops-retention-dry-run-loading">
                  Loading retention dry-run…
                </p>
              ) : null}
            </section>

            <section className="card ops-retention-audit-card" data-testid="ops-retention-audit-snapshots">
              <div className="ops-retention-dry-run-head">
                <div>
                  <h3 className="ops-runtime-section-title">Retention audit snapshots</h3>
                  <p className="hint ops-retention-dry-run-disclaimer" data-testid="ops-retention-audit-disclaimer">
                    Audit snapshot only. No data will be deleted.
                  </p>
                </div>
                <button
                  type="button"
                  className="team-members-add-btn ops-runtime-refresh-btn"
                  data-testid="ops-retention-save-snapshot"
                  disabled={
                    snapshotSaveBusy ||
                    retentionBusy ||
                    retentionUnavailable ||
                    !retentionReport ||
                    purgeRunsUnavailable
                  }
                  onClick={() => void saveDryRunSnapshot()}
                >
                  {snapshotSaveBusy ? "Saving…" : "Save dry-run snapshot"}
                </button>
              </div>

              <label className="ops-retention-notes-field">
                <span className="leads-filter-label">Snapshot notes (optional)</span>
                <input
                  type="text"
                  value={snapshotNotes}
                  onChange={(e) => setSnapshotNotes(e.target.value)}
                  placeholder="e.g. Pre-deploy baseline"
                  maxLength={200}
                  data-testid="ops-retention-snapshot-notes"
                />
              </label>

              {purgeRunsUnavailable ? (
                <p className="hint" data-testid="ops-retention-audit-unavailable" role="status">
                  Retention purge runs API is not available yet. Save and history will work when{" "}
                  <code>GET/POST /api/retention/purge-runs</code> is deployed.
                </p>
              ) : null}

              {snapshotError ? (
                <div className="error ops-retention-dry-run-error" data-testid="ops-retention-snapshot-error" role="alert">
                  {snapshotError}
                </div>
              ) : null}

              {snapshotSuccess ? (
                <p className="hint ops-retention-snapshot-success" data-testid="ops-retention-snapshot-success" role="status">
                  {snapshotSuccess}
                </p>
              ) : null}

              {purgeRunsError ? (
                <div className="error ops-retention-dry-run-error" data-testid="ops-retention-audit-error" role="alert">
                  {purgeRunsError}
                </div>
              ) : null}

              <div className="ops-retention-audit-history" data-testid="ops-retention-audit-history">
                <h4 className="ops-retention-sample-title">Recent audit snapshots</h4>
                {purgeRunsBusy && purgeRuns.length === 0 ? (
                  <p className="hint" data-testid="ops-retention-audit-loading">
                    Loading audit snapshots…
                  </p>
                ) : null}
                {!purgeRunsBusy && purgeRuns.length === 0 && !purgeRunsUnavailable && !purgeRunsError ? (
                  <p className="hint" data-testid="ops-retention-audit-empty">
                    No audit snapshots yet. Load a dry-run report and use Save dry-run snapshot.
                  </p>
                ) : null}
                {purgeRuns.map((run) => (
                  <RetentionPurgeRunHistoryItem
                    key={run.id}
                    run={run}
                    executionMeta={purgeRunsMeta}
                    executeApiUnavailable={executeApiUnavailable}
                    purgeRunsUnavailable={purgeRunsUnavailable}
                    onExecuteRawPayload={executeRawPayloadCleanup}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
