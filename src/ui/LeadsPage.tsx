"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialsAvatarFromDisplayName } from "./chatComposerModel.js";
import {
  buildLeadsListUrl,
  DEFAULT_LEADS_LIST_FILTERS,
  filtersAreDefault,
  formatLeadsCreatedDate,
  formatLeadsDateTime,
  formatLeadsLoadedCount,
  getLeadStatusBadgeLabel,
  mapLeadsFetchError,
  normalizeLeadsProfileImageUrl,
  parseLeadsListResponse,
  resolveLeadInboxActionState,
  resolveLeadRowFollowUpBadge,
  resolveLeadRowSlaBadge,
  type LeadPipelineRow,
  type LeadsListFilters
} from "./leadsPageModel.js";
import { canViewAnalyticsNav, canViewSlaPolicyNav, canViewWorkQueueNav } from "./dashboardNavAccess.js";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

type SalesAgentOption = { id: string; name: string };

function LeadRowAvatar({ displayName, profileImageUrl }: { displayName: string; profileImageUrl: string | null }) {
  const [imageBroken, setImageBroken] = useState(false);
  const imageUrl = normalizeLeadsProfileImageUrl(profileImageUrl);
  const alt = `${displayName} profile`;

  if (imageUrl && !imageBroken) {
    return (
      <img
        className="leads-row-avatar leads-row-avatar-img"
        src={imageUrl}
        alt={alt}
        title={displayName}
        onError={() => setImageBroken(true)}
      />
    );
  }

  return (
    <span className="leads-row-avatar leads-row-avatar-initials" aria-hidden title={displayName}>
      {initialsAvatarFromDisplayName(displayName)}
    </span>
  );
}

function LeadsInboxCell({ row }: { row: LeadPipelineRow }) {
  const inbox = resolveLeadInboxActionState(row);

  if (inbox.canOpen && inbox.href) {
    return (
      <a href={inbox.href} className="leads-open-inbox-link" data-testid={`leads-open-inbox-${row.leadId}`}>
        Open inbox
      </a>
    );
  }

  if (!inbox.statusLabel && !inbox.helperText) {
    return <span className="hint">—</span>;
  }

  return (
    <div className="leads-inbox-action-cell" data-testid={`leads-inbox-unavailable-${row.leadId}`}>
      {inbox.statusLabel ? (
        <span className={inbox.statusClassName} data-testid={`leads-inbox-state-${row.leadId}`}>
          {inbox.statusLabel}
        </span>
      ) : null}
      {inbox.helperText ? (
        <span className="hint leads-inbox-helper" data-testid={`leads-inbox-helper-${row.leadId}`}>
          {inbox.helperText}
        </span>
      ) : null}
      <button
        type="button"
        className="leads-open-inbox-link leads-open-inbox-link-disabled"
        disabled
        aria-disabled="true"
        data-testid={`leads-open-inbox-disabled-${row.leadId}`}
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        Open inbox
      </button>
    </div>
  );
}

function LeadsTableRow({
  row,
  now,
  slaWarningBeforeBreachMinutes
}: {
  row: LeadPipelineRow;
  now: Date;
  slaWarningBeforeBreachMinutes?: number | null;
}) {
  const followBadge = resolveLeadRowFollowUpBadge(row, now);
  const slaBadge = resolveLeadRowSlaBadge(
    row,
    now,
    slaWarningBeforeBreachMinutes != null ? { slaWarningBeforeBreachMinutes } : undefined
  );
  const channelKey = row.channel.toLowerCase();

  return (
    <tr data-testid={`leads-row-${row.leadId}`}>
      <td>
        <div className="leads-row-customer">
          <LeadRowAvatar displayName={row.displayName} profileImageUrl={row.profileImageUrl} />
          <div className="leads-row-customer-text">
            <span className="leads-row-name">{row.displayName}</span>
            {row.lastMessagePreview ? (
              <span className="leads-row-preview">{row.lastMessagePreview}</span>
            ) : null}
          </div>
        </div>
      </td>
      <td>
        <span className={`channel-badge channel-badge-${channelKey}`}>{row.channel}</span>
      </td>
      <td>
        <span className="inbox-badge leads-status-badge">{getLeadStatusBadgeLabel(row.leadStatus)}</span>
      </td>
      <td>{row.ownerName.trim() || "Unassigned"}</td>
      <td className="leads-col-time">{formatLeadsDateTime(row.lastMessageAt, now)}</td>
      <td>
        <div className="leads-row-badges">
          {followBadge ? <span className={followBadge.className}>{followBadge.label}</span> : <span className="hint">—</span>}
        </div>
      </td>
      <td>
        <div className="leads-row-badges">
          {slaBadge ? <span className={slaBadge.className}>{slaBadge.label}</span> : <span className="hint">—</span>}
        </div>
      </td>
      <td className="leads-col-time">{formatLeadsCreatedDate(row.createdAt)}</td>
      <td>
        <LeadsInboxCell row={row} />
      </td>
    </tr>
  );
}

export default function LeadsPage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [salesAgents, setSalesAgents] = useState<SalesAgentOption[]>([]);
  const [filters, setFilters] = useState<LeadsListFilters>(DEFAULT_LEADS_LIST_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<LeadsListFilters>(DEFAULT_LEADS_LIST_FILTERS);
  const [leads, setLeads] = useState<LeadPipelineRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [slaWarningBeforeBreachMinutes, setSlaWarningBeforeBreachMinutes] = useState<number | null>(null);
  const [listError, setListError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [listPhase, setListPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadingMore, setLoadingMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const now = useMemo(() => new Date(), [leads.length, listPhase]);

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

  const loadLeadsMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (
      !session ||
      !hasRequiredSessionConfig(session) ||
      !meContext ||
      meError ||
      !cursor ||
      loadingMoreRef.current
    ) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const url = buildLeadsListUrl(appliedFilters, cursor);
      const { res, body } = await apiFetch(url);
      if (!res.ok) {
        setLoadMoreError(mapLeadsFetchError(res.status, body));
        return;
      }
      const parsed = parseLeadsListResponse(body);
      if (!parsed.ok) {
        setLoadMoreError(parsed.error);
        return;
      }
      setNextCursor(parsed.pageInfo.nextCursor);
      if (parsed.pageInfo.slaWarningBeforeBreachMinutes != null) {
        setSlaWarningBeforeBreachMinutes(parsed.pageInfo.slaWarningBeforeBreachMinutes);
      }
      setLeads((prev) => {
        const seen = new Set(prev.map((r) => r.leadId));
        const merged = [...prev];
        for (const row of parsed.items) {
          if (!seen.has(row.leadId)) merged.push(row);
        }
        return merged;
      });
    } catch (e) {
      setLoadMoreError(String(e instanceof Error ? e.message : e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [session, meContext, meError, appliedFilters]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let cancelled = false;
    setMeError("");
    (async () => {
      try {
        const { res, body } = await apiFetch("/api/me");
        if (cancelled) return;
        if (!res.ok) throw new Error(mapLeadsFetchError(res.status, body));
        const data = (body as { data?: MeContext })?.data;
        if (!data || typeof data.role !== "string") throw new Error("Invalid /api/me response");
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
    if (!meContext || meError) return;
    if (meContext.role === "MANAGER" || meContext.role === "ADMIN") {
      let cancelled = false;
      (async () => {
        try {
          const { res, body } = await apiFetch("/api/sales-agents");
          if (cancelled || !res.ok) return;
          const rows = (body as { data?: Array<{ id?: string; name?: string }> })?.data ?? [];
          setSalesAgents(
            rows
              .filter((r) => typeof r.id === "string" && typeof r.name === "string")
              .map((r) => ({ id: r.id as string, name: r.name as string }))
          );
        } catch {
          if (!cancelled) setSalesAgents([]);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meContext?.userId, meContext?.role, meError]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session) || !meContext || meError) return;
    let cancelled = false;
    setListPhase("loading");
    setListError("");
    setLoadMoreError("");
    setNextCursor(null);
    (async () => {
      try {
        const url = buildLeadsListUrl(appliedFilters);
        const { res, body } = await apiFetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setLeads([]);
          setListPhase("error");
          setListError(mapLeadsFetchError(res.status, body));
          return;
        }
        const parsed = parseLeadsListResponse(body);
        if (cancelled) return;
        if (!parsed.ok) {
          setLeads([]);
          setListPhase("error");
          setListError(parsed.error);
          return;
        }
        setLeads(parsed.items);
        setNextCursor(parsed.pageInfo.nextCursor);
        if (parsed.pageInfo.slaWarningBeforeBreachMinutes != null) {
          setSlaWarningBeforeBreachMinutes(parsed.pageInfo.slaWarningBeforeBreachMinutes);
        }
        setListPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setLeads([]);
          setListPhase("error");
          setListError(String(e instanceof Error ? e.message : e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meContext?.userId, meError, appliedFilters, session?.baseUrl, session?.accessToken, session?.tenantId]);

  function applyFiltersFromUi() {
    setAppliedFilters({ ...filters, search: searchDraft.trim() });
  }

  function clearFilters() {
    setFilters(DEFAULT_LEADS_LIST_FILTERS);
    setSearchDraft("");
    setAppliedFilters(DEFAULT_LEADS_LIST_FILTERS);
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

  const canManageTeam = Boolean(meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN"));
  const showEmpty = listPhase === "ready" && !listError && leads.length === 0;
  const showTable = listPhase === "ready" && !listError && leads.length > 0;
  const showLoadMore = showTable && Boolean(nextCursor);
  const showAllLoaded = showTable && !nextCursor && !loadingMore;
  const loadedCountLabel = formatLeadsLoadedCount(leads.length);

  return (
    <main className="leads-root" data-testid="leads-page">
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
          {meContext?.role === "ADMIN" ? (
            <a href="/dashboard/ops" className="app-rail-nav-item" data-testid="nav-ops-runtime" title="Ops Runtime">
              <span className="app-rail-nav-icon" aria-hidden="true">
                OP
              </span>
              <span className="app-rail-nav-label">Ops</span>
            </a>
          ) : null}
          <a
            href="/dashboard/leads"
            className="app-rail-nav-item app-rail-nav-item-active"
            aria-current="page"
            data-testid="nav-leads"
            title="Leads"
          >
            <span className="app-rail-nav-icon" aria-hidden="true">
              LD
            </span>
            <span className="app-rail-nav-label">Leads</span>
          </a>
          {canViewWorkQueueNav(meContext?.role) ? (
            <a href="/dashboard/work-queue" className="app-rail-nav-item" data-testid="nav-work-queue" title="Work Queue">
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
          {meContext?.role === "ADMIN" ? (
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
            data-testid="leads-sign-out"
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

      <section className="leads-main">
        {meError ? <div className="card error">{meError}</div> : null}
        {!meContext && !meError ? (
          <div className="card" data-testid="leads-loading-me">
            <p className="hint">Loading profile…</p>
          </div>
        ) : null}

        {meContext && !meError ? (
          <>
            <header className="leads-header card">
              <div className="leads-header-text">
                <p className="leads-eyebrow">Pipeline</p>
                <h1>Leads</h1>
                <p className="hint leads-subtitle">Read-only lead pipeline view. Open a conversation in Team Inbox to respond.</p>
              </div>
            </header>

            <section className="card leads-filters" data-testid="leads-filters">
              <h2 className="leads-filters-title">Filters</h2>
              <div className="leads-filter-grid">
                <label className="leads-filter-field">
                  <span className="leads-filter-label">Status</span>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as LeadsListFilters["status"] }))}
                    data-testid="leads-filter-status"
                  >
                    <option value="all">All statuses</option>
                    <option value="NEW">New</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="PROPOSAL_SENT">Proposal sent</option>
                    <option value="NEGOTIATION">Negotiation</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                    <option value="UNQUALIFIED">Unqualified</option>
                  </select>
                </label>
                <label className="leads-filter-field">
                  <span className="leads-filter-label">Channel</span>
                  <select
                    value={filters.channel}
                    onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value as LeadsListFilters["channel"] }))}
                    data-testid="leads-filter-channel"
                  >
                    <option value="all">All channels</option>
                    <option value="LINE">LINE</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="SHOPEE">Shopee</option>
                    <option value="LAZADA">Lazada</option>
                  </select>
                </label>
                <label className="leads-filter-field">
                  <span className="leads-filter-label">Owner</span>
                  <select
                    value={filters.owner}
                    onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}
                    data-testid="leads-filter-owner"
                  >
                    <option value="all">All owners</option>
                    <option value="me">My leads</option>
                    {salesAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="leads-filter-field">
                  <span className="leads-filter-label">Follow-up</span>
                  <select
                    value={filters.followUp}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, followUp: e.target.value as LeadsListFilters["followUp"] }))
                    }
                    data-testid="leads-filter-follow-up"
                  >
                    <option value="all">All</option>
                    <option value="overdue">Overdue</option>
                    <option value="today">Today</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label className="leads-filter-field">
                  <span className="leads-filter-label">SLA</span>
                  <select
                    value={filters.sla}
                    onChange={(e) => setFilters((f) => ({ ...f, sla: e.target.value as LeadsListFilters["sla"] }))}
                    data-testid="leads-filter-sla"
                  >
                    <option value="all">All</option>
                    <option value="overdue">Overdue</option>
                    <option value="dueSoon">Due soon</option>
                  </select>
                </label>
                <label className="leads-filter-field leads-filter-search">
                  <span className="leads-filter-label">Search</span>
                  <input
                    type="search"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Name or message preview"
                    data-testid="leads-filter-search"
                  />
                </label>
              </div>
              <div className="leads-filter-actions">
                <button type="button" className="leads-filter-btn" data-testid="leads-filter-apply" onClick={applyFiltersFromUi}>
                  Apply filters
                </button>
                <button
                  type="button"
                  className="leads-filter-btn"
                  data-testid="leads-filter-clear"
                  onClick={clearFilters}
                  disabled={filtersAreDefault(filters) && searchDraft.trim() === ""}
                >
                  Clear filters
                </button>
              </div>
            </section>

            {listPhase === "loading" ? (
              <div className="card leads-state-panel" data-testid="leads-loading">
                <p className="hint">Loading leads…</p>
                <div className="leads-skeleton-row" />
                <div className="leads-skeleton-row" />
                <div className="leads-skeleton-row" />
              </div>
            ) : null}

            {listError ? (
              <div className="card error leads-state-panel" data-testid="leads-error" role="alert">
                {listError}
              </div>
            ) : null}

            {showEmpty ? (
              <div className="card leads-empty-state" data-testid="leads-empty">
                <h2>No leads match your filters</h2>
                <p className="hint">Try clearing filters or adjusting your search.</p>
              </div>
            ) : null}

            {showTable ? (
              <div className="leads-list-panel" data-testid="leads-list-panel">
                <p className="leads-loaded-count" data-testid="leads-loaded-count">
                  {loadedCountLabel}
                </p>
                <div className="card leads-table-wrap" data-testid="leads-table-wrap">
                  <div className="leads-table-scroll" data-testid="leads-table-scroll">
                    <table className="leads-table">
                      <thead>
                        <tr>
                          <th>Lead</th>
                          <th>Channel</th>
                          <th>Status</th>
                          <th>Owner</th>
                          <th>Last message</th>
                          <th>Follow-up</th>
                          <th>SLA</th>
                          <th>Created</th>
                          <th>Inbox</th>
                        </tr>
                      </thead>
                      <tbody data-testid="leads-table-body">
                        {leads.map((row) => (
                          <LeadsTableRow
                            key={row.leadId}
                            row={row}
                            now={now}
                            slaWarningBeforeBreachMinutes={slaWarningBeforeBreachMinutes}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card leads-pagination-footer" data-testid="leads-pagination">
                  {loadMoreError ? (
                    <p className="error leads-load-more-error" data-testid="leads-load-more-error" role="alert">
                      {loadMoreError}
                    </p>
                  ) : null}
                  {showLoadMore ? (
                    <button
                      type="button"
                      className="leads-filter-btn"
                      data-testid="leads-load-more"
                      disabled={loadingMore}
                      onClick={() => void loadLeadsMore()}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  ) : null}
                  {showAllLoaded ? (
                    <p className="hint leads-all-loaded" data-testid="leads-all-loaded">
                      All loaded
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
