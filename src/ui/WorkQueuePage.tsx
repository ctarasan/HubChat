"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowFollowUpItemDto, WorkflowScope } from "../domain/workflow.js";
import {
  canViewAnalyticsNav,
  canViewSlaPolicyNav,
  canViewWorkQueueNav
} from "./dashboardNavAccess.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  buildWorkflowItemsPath,
  buildWorkflowSummaryPath,
  canUseWorkQueueTeamScope,
  formatWorkflowGeneratedAt,
  mapWorkflowLoadError,
  parseWorkflowItemsGetResponse,
  parseWorkflowSummaryGetResponse,
  readWorkQueueUrlFilters,
  resolveWorkQueueScopeForRole,
  summaryCardsFromCounts,
  workQueueEmptyMessage,
  type WorkQueueChannelFilter,
  type WorkQueueStatusFilter
} from "./workQueueModel.js";
import { WorkQueueIcon } from "./workQueueIcons.js";
import { WorkQueueItemCard, WorkQueueSummaryCardButton } from "./workQueueUi.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

const WORK_QUEUE_PAGE_LIMIT = 25;

async function fetchWithTenantHeaders(
  session: SessionConfig,
  tenantId: string,
  path: string
): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(`${session.baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "x-tenant-id": tenantId,
      "Content-Type": "application/json"
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

function readInitialUrlFilters(): { status: WorkQueueStatusFilter; scope?: WorkflowScope } {
  if (typeof window === "undefined") return { status: "all" };
  const url = readWorkQueueUrlFilters(window.location.search);
  return { status: url.status ?? "all", scope: url.scope };
}

export default function WorkQueuePage() {
  const initialUrl = useMemo(() => readInitialUrlFilters(), []);
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [scope, setScope] = useState<WorkflowScope>("mine");
  const [statusFilter, setStatusFilter] = useState<WorkQueueStatusFilter>(initialUrl.status);
  const [channelFilter, setChannelFilter] = useState<WorkQueueChannelFilter>("all");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [summaryCounts, setSummaryCounts] = useState({
    scheduled: 0,
    overdue: 0,
    dueToday: 0,
    upcoming: 0
  });
  const [items, setItems] = useState<WorkflowFollowUpItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const loadMe = useCallback(async (): Promise<MeContext | null> => {
    if (!session || !hasRequiredSessionConfig(session)) return null;
    const { res, body } = await fetchWithTenantHeaders(session, session.tenantId, "/api/me");
    if (!res.ok) {
      setMeError(mapWorkflowLoadError(res.status, body));
      return null;
    }
    const meBody = body as { data?: MeContext };
    const me = meBody.data ?? null;
    if (!me || !canViewWorkQueueNav(me.role)) {
      setMeError("You do not have permission to view the work queue.");
      return null;
    }
    setMeContext(me);
    setMeError("");
    const resolvedScope = resolveWorkQueueScopeForRole(me.role, initialUrl.scope);
    setScope(resolvedScope);
    return me;
  }, [session, initialUrl.scope]);

  const fetchPage = useCallback(
    async (input: {
      me: MeContext;
      scopeValue: WorkflowScope;
      status: WorkQueueStatusFilter;
      channel: WorkQueueChannelFilter;
      cursor?: string | null;
      append: boolean;
    }) => {
      if (!session || !hasRequiredSessionConfig(session)) return;
      const tenantId = resolveTenantId(input.me, session);
      const scopeValue = resolveWorkQueueScopeForRole(input.me.role, input.scopeValue);
      const statusParam = input.status === "all" ? undefined : input.status;
      const channelParam = input.channel === "all" ? undefined : input.channel;

      const summaryPath = buildWorkflowSummaryPath(scopeValue);
      const itemsPath = buildWorkflowItemsPath({
        scope: scopeValue,
        status: statusParam,
        channel: channelParam,
        limit: WORK_QUEUE_PAGE_LIMIT,
        cursor: input.cursor ?? undefined
      });

      const [summaryRes, itemsRes] = await Promise.all([
        fetchWithTenantHeaders(session, tenantId, summaryPath),
        fetchWithTenantHeaders(session, tenantId, itemsPath)
      ]);

      if (summaryRes.res.status === 403 || itemsRes.res.status === 403) {
        setAccessDenied(true);
        setLoadError("You do not have permission to view this work queue scope.");
        setItems([]);
        return;
      }
      setAccessDenied(false);

      if (!summaryRes.res.ok) {
        setLoadError(mapWorkflowLoadError(summaryRes.res.status, summaryRes.body));
        if (!input.append) setItems([]);
        return;
      }
      if (!itemsRes.res.ok) {
        setLoadError(mapWorkflowLoadError(itemsRes.res.status, itemsRes.body));
        if (!input.append) setItems([]);
        return;
      }

      const summaryParsed = parseWorkflowSummaryGetResponse(summaryRes.body);
      const itemsParsed = parseWorkflowItemsGetResponse(itemsRes.body);
      if (!summaryParsed.ok) {
        setLoadError(summaryParsed.error);
        if (!input.append) setItems([]);
        return;
      }
      if (!itemsParsed.ok) {
        setLoadError(itemsParsed.error);
        if (!input.append) setItems([]);
        return;
      }

      setLoadError("");
      setGeneratedAt(itemsParsed.data.generatedAt);
      setSummaryCounts(itemsParsed.data.sections.followUp);
      setScope(itemsParsed.data.scope);
      setNextCursor(itemsParsed.data.pageInfo.nextCursor);
      setItems((prev) =>
        input.append ? [...prev, ...itemsParsed.data.items] : itemsParsed.data.items
      );
      setHasLoadedOnce(true);
    },
    [session]
  );

  const reload = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let me = meContext;
    if (!me) {
      me = await loadMe();
      if (!me) return;
    }
    setLoadBusy(true);
    try {
      await fetchPage({
        me,
        scopeValue: scope,
        status: statusFilter,
        channel: channelFilter,
        append: false
      });
    } finally {
      setLoadBusy(false);
    }
  }, [session, meContext, loadMe, fetchPage, scope, statusFilter, channelFilter]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    void loadMe();
  }, [session, loadMe]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session) || !meContext) return;
    void (async () => {
      setLoadBusy(true);
      try {
        await fetchPage({
          me: meContext,
          scopeValue: scope,
          status: statusFilter,
          channel: channelFilter,
          append: false
        });
      } finally {
        setLoadBusy(false);
      }
    })();
  }, [session, meContext, scope, statusFilter, channelFilter, fetchPage]);

  const loadMore = async () => {
    if (!meContext || !nextCursor || loadMoreBusy) return;
    setLoadMoreBusy(true);
    try {
      await fetchPage({
        me: meContext,
        scopeValue: scope,
        status: statusFilter,
        channel: channelFilter,
        cursor: nextCursor,
        append: true
      });
    } finally {
      setLoadMoreBusy(false);
    }
  };

  const summaryCards = useMemo(() => summaryCardsFromCounts(summaryCounts), [summaryCounts]);
  const canManageTeam = Boolean(meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN"));
  const canTeamScope = canUseWorkQueueTeamScope(meContext?.role);
  const isAdmin = meContext?.role === "ADMIN";
  const showEmpty = hasLoadedOnce && !loadBusy && !loadError && !accessDenied && items.length === 0;
  const showList = hasLoadedOnce && !loadError && !accessDenied && items.length > 0;

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="work-queue-root" data-testid="work-queue-page">
        <div className="work-queue-main">
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
    <main className="work-queue-root" data-testid="work-queue-page">
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
          {canViewWorkQueueNav(meContext?.role) ? (
            <a
              href="/dashboard/work-queue"
              className="app-rail-nav-item app-rail-nav-item-active"
              aria-current="page"
              data-testid="nav-work-queue"
              title="Work Queue"
            >
              <span className="app-rail-nav-icon" aria-hidden="true">
                WQ
              </span>
              <span className="app-rail-nav-label">Queue</span>
            </a>
          ) : null}
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
        </nav>
        <div className="app-rail-footer">
          <button
            type="button"
            className="app-rail-footer-btn"
            data-testid="work-queue-sign-out"
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
        </div>
      </aside>

      <section className="work-queue-main">
        {meError ? <div className="card error">{meError}</div> : null}

        {accessDenied ? (
          <div className="card work-queue-access-denied" data-testid="work-queue-access-denied">
            <h2>Access denied</h2>
            <p className="hint">You do not have permission to view this work queue scope.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            <header className="team-members-header team-members-header-hero work-queue-header">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Workflow</p>
                <h2>Work Queue</h2>
                <p className="team-members-subtitle">Follow-up tasks that need attention (read-only)</p>
                {generatedAt ? (
                  <p className="hint" data-testid="work-queue-generated-at">
                    Updated: {formatWorkflowGeneratedAt(generatedAt)}
                  </p>
                ) : null}
              </div>
              <div className="work-queue-header-actions">
                <button
                  type="button"
                  className="work-queue-filter-pill work-queue-reload-btn"
                  data-testid="work-queue-reload"
                  disabled={loadBusy}
                  onClick={() => void reload()}
                >
                  <WorkQueueIcon name="refresh" className="work-queue-reload-icon" />
                  <span>{loadBusy ? "Loading…" : "Reload"}</span>
                </button>
              </div>
            </header>

            <div
              className="work-queue-summary-grid analytics-summary-grid"
              data-testid="work-queue-summary"
            >
              {summaryCards.map((card) => (
                <WorkQueueSummaryCardButton
                  key={card.id}
                  card={card}
                  active={statusFilter === card.statusFilter}
                  onClick={() => setStatusFilter(card.statusFilter)}
                />
              ))}
            </div>

            <div className="work-queue-filters" data-testid="work-queue-filters">
              {canTeamScope ? (
                <div className="work-queue-filter-row" role="group" aria-label="Scope">
                  <span className="work-queue-filter-label">Scope</span>
                  <div className="work-queue-filter-pills">
                    {(
                      [
                        ["team", "Team"],
                        ["mine", "Mine"]
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          scope === key
                            ? "work-queue-filter-pill work-queue-filter-pill-active"
                            : "work-queue-filter-pill"
                        }
                        data-testid={`work-queue-scope-${key}`}
                        disabled={loadBusy}
                        onClick={() => setScope(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="hint work-queue-sales-hint" data-testid="work-queue-sales-hint">
                  My follow-ups (scope: mine)
                </p>
              )}

              <div className="work-queue-filter-row" role="group" aria-label="Status filter">
                <span className="work-queue-filter-label">Status</span>
                <div className="work-queue-filter-pills">
                  {(
                    [
                      ["all", "All scheduled"],
                      ["overdue", "Overdue"],
                      ["due_today", "Due today"],
                      ["upcoming", "Upcoming"],
                      ["scheduled", "Scheduled"]
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={
                        statusFilter === key
                          ? "work-queue-filter-pill work-queue-filter-pill-active"
                          : "work-queue-filter-pill"
                      }
                      data-testid={`work-queue-status-${key.replace("_", "-")}`}
                      disabled={loadBusy}
                      onClick={() => setStatusFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="work-queue-filter-row" role="group" aria-label="Channel filter">
                <span className="work-queue-filter-label">Channel</span>
                <div className="work-queue-filter-pills">
                  {(
                    [
                      ["all", "All"],
                      ["LINE", "LINE"],
                      ["FACEBOOK", "Facebook"],
                      ["INSTAGRAM", "Instagram"]
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={
                        channelFilter === key
                          ? "work-queue-filter-pill work-queue-filter-pill-active"
                          : "work-queue-filter-pill"
                      }
                      data-testid={`work-queue-channel-${key.toLowerCase()}`}
                      disabled={loadBusy}
                      onClick={() => setChannelFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadBusy && !hasLoadedOnce ? (
              <div className="work-queue-loading" data-testid="work-queue-loading">
                <div className="card analytics-skeleton" />
                <div className="card analytics-skeleton" />
              </div>
            ) : null}

            {loadError ? (
              <div className="card error work-queue-load-error" data-testid="work-queue-load-error">
                <p>{loadError}</p>
                <button type="button" className="work-queue-filter-pill" onClick={() => void reload()}>
                  Retry
                </button>
              </div>
            ) : null}

            {showEmpty ? (
              <div className="card work-queue-empty analytics-empty" data-testid="work-queue-empty">
                <p>{workQueueEmptyMessage({ statusFilter, hasActiveChannelFilter: channelFilter !== "all" })}</p>
              </div>
            ) : null}

            {showList ? (
              <ul className="work-queue-list" data-testid="work-queue-list">
                {items.map((item) => (
                  <WorkQueueItemCard key={item.id} item={item} />
                ))}
              </ul>
            ) : null}

            {showList && nextCursor ? (
              <div className="work-queue-load-more">
                <button
                  type="button"
                  className="work-queue-filter-pill"
                  data-testid="work-queue-load-more"
                  disabled={loadMoreBusy}
                  onClick={() => void loadMore()}
                >
                  {loadMoreBusy ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
