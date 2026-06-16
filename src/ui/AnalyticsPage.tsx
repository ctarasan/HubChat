"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyticsChannel, AnalyticsOverviewDto, AnalyticsRange } from "../domain/analyticsOverview.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import { canAccessAnalyticsPage } from "./dashboardNavAccess.js";
import {
  DashboardAppRail,
  DashboardAppRailSetupLink,
  DashboardAppRailSignOutButton
} from "./DashboardAppRail.js";
import { DeploymentEnvironmentBanner } from "./DeploymentEnvironmentBanner.js";
import {
  ANALYTICS_RANGE_OPTIONS,
  barWidthPercent,
  buildAnalyticsOverviewPath,
  channelLabel,
  ensureChannelMessageCounts,
  formatAnalyticsCount,
  formatAnalyticsGeneratedAt,
  formatAnalyticsPeriodLabel,
  formatBreachRatePercent,
  formatSummaryCardValue,
  isAnalyticsOverviewSparse,
  leadStatusLabel,
  managementRollupRows,
  mapAnalyticsLoadError,
  orderedLeadStatusEntries,
  parseAnalyticsOverviewGetResponse,
  safeCount
} from "./analyticsModel.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

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
      "Content-Type": "application/json",
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

function resolveTenantId(me: MeContext | null, session: SessionConfig): string {
  return me?.tenantId?.trim() || session.tenantId.trim();
}

function AnalyticsBarRow({
  label,
  value,
  max,
  testId
}: {
  label: string;
  value: number;
  max: number;
  testId: string;
}) {
  const width = barWidthPercent(value, max);
  return (
    <div className="analytics-bar-row" data-testid={testId}>
      <div className="analytics-bar-row-head">
        <span className="analytics-bar-label">{label}</span>
        <span className="analytics-bar-value">{formatAnalyticsCount(value)}</span>
      </div>
      <div className="analytics-bar-track" aria-hidden="true">
        <div className="analytics-bar-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [overview, setOverview] = useState<AnalyticsOverviewDto | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const loadOverview = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    setLoadBusy(true);
    setLoadError("");
    try {
      let me = meContext;
      if (!me) {
        const meRes = await fetchWithTenantHeaders(session, session.tenantId, "/api/me");
        if (!meRes.res.ok) {
          setMeError(mapAnalyticsLoadError(meRes.res.status, meRes.body));
          return;
        }
        const meBody = meRes.body as { data?: MeContext };
        me = meBody.data ?? null;
        setMeContext(me);
      }
      if (!me || !canAccessAnalyticsPage(me.role)) return;

      const tenantId = resolveTenantId(me, session);
      const { res, body } = await fetchWithTenantHeaders(
        session,
        tenantId,
        buildAnalyticsOverviewPath(range)
      );
      if (!res.ok) {
        setLoadError(mapAnalyticsLoadError(res.status, body));
        setOverview(null);
        return;
      }
      const parsed = parseAnalyticsOverviewGetResponse(body);
      if (!parsed.ok) {
        setLoadError(parsed.error);
        setOverview(null);
        return;
      }
      setOverview(parsed.data);
    } finally {
      setLoadBusy(false);
    }
  }, [session, meContext, range]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (meContext && !canAccessAnalyticsPage(meContext.role)) return;
    void loadOverview();
  }, [session, meContext?.role, range, loadOverview]);

  const canAccess = Boolean(meContext && canAccessAnalyticsPage(meContext.role) && !meError);
  const sparse = useMemo(() => (overview ? isAnalyticsOverviewSparse(overview) : false), [overview]);

  const leadStatusRows = useMemo(
    () => (overview ? orderedLeadStatusEntries(overview.leadPipeline?.byStatus) : []),
    [overview]
  );
  const leadStatusMax = useMemo(
    () => Math.max(1, ...leadStatusRows.map((r) => r.count)),
    [leadStatusRows]
  );
  const rollupRows = useMemo(
    () => (overview ? managementRollupRows(overview.leadPipeline?.managementRollup) : []),
    [overview]
  );
  const rollupMax = useMemo(() => Math.max(1, ...rollupRows.map((r) => r.count)), [rollupRows]);

  const inboundByChannel = useMemo(
    () => ensureChannelMessageCounts(overview?.channelBreakdown?.period?.inboundMessages),
    [overview]
  );
  const outboundByChannel = useMemo(
    () => ensureChannelMessageCounts(overview?.channelBreakdown?.period?.outboundMessages),
    [overview]
  );
  const messageMax = useMemo(() => {
    const vals = [...Object.values(inboundByChannel), ...Object.values(outboundByChannel)];
    return Math.max(1, ...vals);
  }, [inboundByChannel, outboundByChannel]);

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="analytics-root" data-testid="analytics-page">
        <div className="analytics-main">
          <p>
            Missing session.{" "}
            <a href="/login" className="primary-link">
              Sign in
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="analytics-root" data-testid="analytics-page">
      <DashboardAppRail
        activeId="analytics"
        role={meContext?.role}
        footer={
          <>
            <DashboardAppRailSignOutButton
              testId="analytics-sign-out"
              onSignOut={() => {
                clearSessionConfig(globalThis.localStorage);
                window.location.replace("/login");
              }}
            />
            <DashboardAppRailSetupLink />
          </>
        }
      />

      <section className="analytics-main">
        <DeploymentEnvironmentBanner />
        {meError ? <div className="card error">{meError}</div> : null}

        {meContext && !canAccessAnalyticsPage(meContext.role) ? (
          <div className="card analytics-access-denied" data-testid="analytics-access-denied">
            <h2>Access denied</h2>
            <p className="hint">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : canAccess ? (
          <>
            <header className="team-members-header team-members-header-hero analytics-header">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Insights</p>
                <h2>Analytics</h2>
                <p className="team-members-subtitle">
                  ภาพรวม tenant แบบอ่านอย่างเดียว (aggregate/count) — ไม่มีข้อความลูกค้าหรือการแก้ไขข้อมูล
                </p>
                {overview ? (
                  <div className="analytics-header-meta">
                    <p className="hint" data-testid="analytics-generated-at">
                      อัปเดต: {formatAnalyticsGeneratedAt(overview.generatedAt)}
                    </p>
                    <p className="hint" data-testid="analytics-period">
                      ช่วงเวลา: {formatAnalyticsPeriodLabel(overview.period.startAt, overview.period.endAt)}
                    </p>
                    <span className="inbox-badge analytics-policy-badge" data-testid="analytics-sla-policy-badge">
                      SLA Policy: {overview.slaPolicy?.enabled ? "เปิด" : "ปิด"} · เตือนก่อนครบ{" "}
                      {safeCount(overview.slaPolicy?.warningBeforeBreachMinutes)} นาที
                    </span>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="team-members-add-btn analytics-reload-btn"
                data-testid="analytics-reload"
                disabled={loadBusy}
                onClick={() => void loadOverview()}
              >
                {loadBusy ? "Loading…" : "Reload"}
              </button>
            </header>

            <div className="analytics-range-tabs" role="tablist" aria-label="Analytics range">
              {ANALYTICS_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={range === opt.value}
                  className={`dashboard-context-tab${range === opt.value ? " dashboard-context-tab-active" : ""}`}
                  data-testid={`analytics-range-${opt.value}`}
                  disabled={loadBusy}
                  onClick={() => setRange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {loadError ? (
              <div className="card error" data-testid="analytics-load-error" role="alert">
                <p>{loadError}</p>
                <button type="button" className="primary-link analytics-retry-btn" onClick={() => void loadOverview()}>
                  ลองใหม่
                </button>
              </div>
            ) : null}

            {loadBusy && !overview ? (
              <div className="analytics-loading" data-testid="analytics-loading" aria-live="polite">
                <div className="analytics-skeleton card" />
                <div className="analytics-skeleton card" />
              </div>
            ) : null}

            {overview && !loadError ? (
              <>
                {sparse ? (
                  <div className="card analytics-empty" data-testid="analytics-empty">
                    <p className="hint">ยังไม่มีข้อมูลมากในช่วงเวลานี้ — ตัวเลขด้านล่างเป็นศูนย์หรือน้อยมาก</p>
                  </div>
                ) : null}

                <section className="analytics-summary-grid" aria-label="Summary" data-testid="analytics-summary">
                  {(overview.summaryCards ?? []).map((card) => (
                    <article
                      key={card.id}
                      className="card analytics-summary-card"
                      data-testid={`analytics-summary-${card.id}`}
                    >
                      <p className="analytics-summary-label">{card.label}</p>
                      <p className="analytics-summary-value">{formatSummaryCardValue(card)}</p>
                    </article>
                  ))}
                  <article className="card analytics-summary-card" data-testid="analytics-summary-breach-rate">
                    <p className="analytics-summary-label">SLA breach rate</p>
                    <p className="analytics-summary-value">
                      {formatBreachRatePercent(overview.sla?.rates?.breachRate)}
                    </p>
                    <p className="hint">overdue ÷ active SLA (snapshot)</p>
                  </article>
                </section>

                <section className="card analytics-section" data-testid="analytics-sla-section">
                  <h3 className="analytics-section-title">Conversation &amp; SLA</h3>
                  <div className="team-members-summary">
                    {[
                      { label: "Total conversations", value: overview.conversations?.snapshot?.total },
                      { label: "Open", value: overview.conversations?.snapshot?.open },
                      { label: "Pending", value: overview.conversations?.snapshot?.pending },
                      { label: "Resolved", value: overview.conversations?.snapshot?.resolved },
                      { label: "New in period", value: overview.conversations?.period?.newCount },
                      { label: "SLA overdue", value: overview.sla?.snapshot?.overdue },
                      { label: "SLA due soon", value: overview.sla?.snapshot?.dueSoon },
                      { label: "SLA on track", value: overview.sla?.snapshot?.onTrack },
                      { label: "No SLA", value: overview.sla?.snapshot?.none }
                    ].map((item) => (
                      <div key={item.label} className="team-members-stat-card">
                        <div className="team-members-stat-label">{item.label}</div>
                        <div className="team-members-stat-value">{formatAnalyticsCount(item.value)}</div>
                      </div>
                    ))}
                  </div>
                  <p className="hint analytics-breach-hint">
                    Breach rate: {formatBreachRatePercent(overview.sla?.rates?.breachRate)} (active SLA conversations
                    only)
                  </p>
                </section>

                <div className="analytics-two-col">
                  <section className="card analytics-section" data-testid="analytics-lead-pipeline">
                    <h3 className="analytics-section-title">Lead pipeline (CRM status)</h3>
                    {leadStatusRows.map((row) => (
                      <AnalyticsBarRow
                        key={row.status}
                        label={leadStatusLabel(row.status)}
                        value={row.count}
                        max={leadStatusMax}
                        testId={`analytics-lead-status-${row.status}`}
                      />
                    ))}
                    <h4 className="analytics-subtitle">Management rollup</h4>
                    {rollupRows.map((row) => (
                      <AnalyticsBarRow
                        key={row.key}
                        label={row.label}
                        value={row.count}
                        max={rollupMax}
                        testId={`analytics-rollup-${row.key}`}
                      />
                    ))}
                  </section>

                  <section className="card analytics-section" data-testid="analytics-channels">
                    <h3 className="analytics-section-title">Channel breakdown (period)</h3>
                    {(["LINE", "FACEBOOK", "INSTAGRAM"] as AnalyticsChannel[]).map((ch) => (
                      <div key={ch} className="analytics-channel-block" data-testid={`analytics-channel-${ch}`}>
                        <div className="analytics-channel-head">
                          <span className={`channel-badge channel-badge-${ch.toLowerCase()}`}>{channelLabel(ch)}</span>
                          <span className="hint">
                            Open {formatAnalyticsCount(overview.conversations?.byChannel?.find((r) => r.channel === ch)?.open)} / Total{" "}
                            {formatAnalyticsCount(overview.conversations?.byChannel?.find((r) => r.channel === ch)?.total)}
                          </span>
                        </div>
                        <AnalyticsBarRow
                          label="Inbound messages"
                          value={inboundByChannel[ch]}
                          max={messageMax}
                          testId={`analytics-inbound-${ch}`}
                        />
                        <AnalyticsBarRow
                          label="Outbound messages"
                          value={outboundByChannel[ch]}
                          max={messageMax}
                          testId={`analytics-outbound-${ch}`}
                        />
                      </div>
                    ))}
                  </section>
                </div>

                <section className="card analytics-section" data-testid="analytics-team-workload">
                  <h3 className="analytics-section-title">Team workload</h3>
                  {(overview.teamWorkload ?? []).length === 0 ? (
                    <p className="hint" data-testid="analytics-team-empty">
                      ไม่มีข้อมูลทีมในช่วงนี้
                    </p>
                  ) : (
                    <div className="analytics-table-scroll">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>Agent</th>
                            <th>Open conversations</th>
                            <th>SLA overdue</th>
                            <th>Follow-up overdue</th>
                            <th>Assigned leads</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(overview.teamWorkload ?? []).map((row) => (
                            <tr key={row.salesAgentId} data-testid={`analytics-team-row-${row.salesAgentId}`}>
                              <td>{row.displayName?.trim() || "Unknown"}</td>
                              <td>{formatAnalyticsCount(row.openConversations)}</td>
                              <td>{formatAnalyticsCount(row.overdueSla)}</td>
                              <td>{formatAnalyticsCount(row.followUpOverdue)}</td>
                              <td>{formatAnalyticsCount(row.assignedLeads)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="card analytics-section" data-testid="analytics-follow-ups">
                  <h3 className="analytics-section-title">Follow-ups</h3>
                  <div className="team-members-summary">
                    {[
                      { label: "Follow-up scheduled", value: overview.followUps?.snapshot?.scheduled },
                      { label: "Due today", value: overview.followUps?.snapshot?.dueToday },
                      { label: "Overdue", value: overview.followUps?.snapshot?.overdue },
                      { label: "None", value: overview.followUps?.snapshot?.none }
                    ].map((item) => (
                      <div key={item.label} className="team-members-stat-card" data-testid={`analytics-follow-${item.label}`}>
                        <div className="team-members-stat-label">{item.label}</div>
                        <div className="team-members-stat-value">{formatAnalyticsCount(item.value)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
