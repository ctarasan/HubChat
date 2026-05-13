"use client";

import { useEffect, useMemo, useState } from "react";
import { initialsAvatarFromDisplayName } from "./chatComposerModel.js";
import { hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import {
  buildTeamMembersSalesAgentsUrl,
  type TeamMembersAssignmentModeFilter,
  type TeamMembersRoleFilter,
  type TeamMembersStatusFilter
} from "./teamMembersListUrl.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

export type TeamMemberApiRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  assignmentEnabled: boolean;
  assignmentMode: string;
  maxActiveConversations: number | null;
  maxActiveLeads: number | null;
  activeConversationCount: number;
  activeLeadCount: number;
};

function roleLabel(role: string): string {
  if (role === "SALES") return "Sales";
  if (role === "MANAGER") return "Sales Manager";
  if (role === "ADMIN") return "Admin";
  return role;
}

function assignmentModeLabel(mode: string): string {
  if (mode === "AUTO") return "Auto";
  if (mode === "MANUAL_ONLY") return "Manual Only";
  if (mode === "PAUSED") return "Paused";
  return mode;
}

function formatCapMax(max: number | null | undefined): string {
  return max == null ? "Unlimited" : String(max);
}

function formatCapacityLine(active: number, max: number | null | undefined): string {
  return `${active} / ${formatCapMax(max)}`;
}

function utilizationFillPct(active: number, max: number | null | undefined): number | null {
  if (max == null || max <= 0) return null;
  return Math.min(100, (active / max) * 100);
}

function MemberAvatar({ name, email }: { name: string; email: string }) {
  const label = (typeof name === "string" && name.trim()) || email || "?";
  return (
    <span className="team-member-avatar" aria-hidden title={label}>
      {initialsAvatarFromDisplayName(label)}
    </span>
  );
}

function CapacityUtilization({
  kind,
  active,
  max
}: {
  kind: "Conversations" | "Leads";
  active: number;
  max: number | null;
}) {
  const pct = utilizationFillPct(active, max);
  const unlimited = max == null;
  return (
    <div className="team-capacity-util">
      <div className="team-capacity-util-head">
        <span className="team-capacity-util-kind">{kind}</span>
        <span className="team-capacity-util-vals">{formatCapacityLine(active, max)}</span>
      </div>
      <div className="team-capacity-bar-track" role="presentation" aria-hidden>
        {unlimited ? (
          <div className="team-capacity-bar-fill team-capacity-bar-fill-unlimited" />
        ) : (
          <div className="team-capacity-bar-fill" style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

function RosterActionChips() {
  return (
    <div className="team-members-action-row" role="group" aria-label="Member actions (read-only)">
      <button type="button" className="team-members-chip-btn" disabled title="Coming in D1-C">
        Edit
      </button>
      <button type="button" className="team-members-chip-btn" disabled title="Coming in D1-C">
        Role
      </button>
      <button type="button" className="team-members-chip-btn" disabled title="Coming in D1-C">
        Active
      </button>
    </div>
  );
}

function RosterRow({ m }: { m: TeamMemberApiRow }) {
  return (
    <tr>
      <td>
        <div className="team-member-cell">
          <MemberAvatar name={m.name} email={m.email} />
          <div className="team-member-names">
            <div className="team-member-primary-name">{m.name}</div>
            <div className="team-member-email">{m.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span className={`team-role-badge team-role-badge-${String(m.role).toLowerCase()}`}>{roleLabel(m.role)}</span>
      </td>
      <td>
        <span
          className={
            m.status === "ACTIVE" ? "team-status-badge team-status-active" : "team-status-badge team-status-inactive"
          }
        >
          {m.status === "ACTIVE" ? "Active" : "Inactive"}
        </span>
      </td>
      <td>
        <span className="team-mode-badge">{assignmentModeLabel(m.assignmentMode)}</span>
      </td>
      <td className="team-members-capacity-cell">
        <CapacityUtilization kind="Conversations" active={m.activeConversationCount} max={m.maxActiveConversations} />
        <CapacityUtilization kind="Leads" active={m.activeLeadCount} max={m.maxActiveLeads} />
      </td>
      <td>
        <span className="team-metric-pill" title="OPEN + PENDING assigned">
          {m.activeConversationCount}
        </span>
      </td>
      <td>
        <span className="team-metric-pill team-metric-pill-leads" title="Excludes WON, LOST, UNQUALIFIED">
          {m.activeLeadCount}
        </span>
      </td>
      <td className="team-members-metrics-cell">
        <div>Avg Response: —</div>
        <div>Close Rate: —</div>
        <div>Satisfaction: —</div>
        <div>Assignment Score: —</div>
      </td>
      <td>
        <RosterActionChips />
      </td>
    </tr>
  );
}

function MemberCard({ m }: { m: TeamMemberApiRow }) {
  return (
    <article className="team-member-card">
      <div className="team-member-card-head">
        <MemberAvatar name={m.name} email={m.email} />
        <div className="team-member-names">
          <div className="team-member-primary-name">{m.name}</div>
          <div className="team-member-email">{m.email}</div>
        </div>
      </div>
      <div className="team-member-card-badges">
        <span className={`team-role-badge team-role-badge-${String(m.role).toLowerCase()}`}>{roleLabel(m.role)}</span>
        <span
          className={
            m.status === "ACTIVE" ? "team-status-badge team-status-active" : "team-status-badge team-status-inactive"
          }
        >
          {m.status === "ACTIVE" ? "Active" : "Inactive"}
        </span>
        <span className="team-mode-badge">{assignmentModeLabel(m.assignmentMode)}</span>
      </div>
      <div className="team-member-card-metrics">
        <CapacityUtilization kind="Conversations" active={m.activeConversationCount} max={m.maxActiveConversations} />
        <CapacityUtilization kind="Leads" active={m.activeLeadCount} max={m.maxActiveLeads} />
        <div className="team-member-card-counts">
          <span>
            Conv: <strong>{m.activeConversationCount}</strong>
          </span>
          <span>
            Leads: <strong>{m.activeLeadCount}</strong>
          </span>
        </div>
      </div>
      <div className="team-members-metrics-cell team-member-card-perf">
        <div>Avg Response: —</div>
        <div>Close Rate: —</div>
        <div>Satisfaction: —</div>
        <div>Assignment Score: —</div>
      </div>
      <RosterActionChips />
    </article>
  );
}

export default function TeamMembersPage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [members, setMembers] = useState<TeamMemberApiRow[]>([]);
  const [listError, setListError] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<TeamMembersRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TeamMembersStatusFilter>("all");
  const [modeFilter, setModeFilter] = useState<TeamMembersAssignmentModeFilter>("all");

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  useEffect(() => {
    const id = globalThis.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => globalThis.clearTimeout(id);
  }, [searchInput]);

  async function apiFetch(path: string, init?: RequestInit): Promise<any> {
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = typeof json?.error === "string" ? json.error : res.statusText;
      throw new Error(err || `Request failed (${res.status})`);
    }
    return json;
  }

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    let cancelled = false;
    setMeError("");
    (async () => {
      try {
        const res = await apiFetch("/api/me");
        if (cancelled) return;
        const data = res?.data as MeContext | undefined;
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

  const listPath = useMemo(
    () =>
      buildTeamMembersSalesAgentsUrl({
        search: debouncedSearch,
        role: roleFilter,
        status: statusFilter,
        assignmentMode: modeFilter
      }),
    [debouncedSearch, roleFilter, statusFilter, modeFilter]
  );

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    if (!meContext || meError) return;
    if (meContext.role !== "MANAGER" && meContext.role !== "ADMIN") return;
    let cancelled = false;
    setListBusy(true);
    setListError("");
    (async () => {
      try {
        const res = await apiFetch(listPath);
        if (cancelled) return;
        setMembers((res?.data ?? []) as TeamMemberApiRow[]);
      } catch (e) {
        if (!cancelled) {
          setMembers([]);
          setListError(String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) setListBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.baseUrl, session?.tenantId, session?.accessToken, meContext?.userId, meContext?.role, meError, listPath]);

  const summary = useMemo(() => {
    let activeSales = 0;
    let salesManagers = 0;
    let admins = 0;
    let autoAssignment = 0;
    for (const m of members) {
      if (m.status !== "ACTIVE") continue;
      if (m.role === "SALES") activeSales += 1;
      if (m.role === "MANAGER") salesManagers += 1;
      if (m.role === "ADMIN") admins += 1;
    }
    for (const m of members) {
      if (m.assignmentEnabled) autoAssignment += 1;
    }
    return {
      totalMembers: members.length,
      activeSales,
      salesManagers,
      admins,
      autoAssignmentEnabled: autoAssignment
    };
  }, [members]);

  const statCards = useMemo(
    () =>
      [
        {
          label: "Total Members",
          value: summary.totalMembers,
          hint: "Rows returned for current filters"
        },
        {
          label: "Active Sales",
          value: summary.activeSales,
          hint: "ACTIVE status, Sales role"
        },
        {
          label: "Sales Managers",
          value: summary.salesManagers,
          hint: "ACTIVE status, Manager role"
        },
        {
          label: "Admins",
          value: summary.admins,
          hint: "ACTIVE status, Admin role"
        },
        {
          label: "Auto Assignment Enabled",
          value: summary.autoAssignmentEnabled,
          hint: "Members with assignment enabled"
        }
      ] as const,
    [summary]
  );

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="setup-wrapper">
        <div className="card team-members-state-card">
          <h1>Team Members requires session setup</h1>
          <p className="hint">Base URL, Tenant ID, and Access Token are missing. Please configure them first.</p>
          <a href="/setup" className="primary-link">
            Go to Setup
          </a>
        </div>
      </main>
    );
  }

  const canManageTeam = meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN");

  return (
    <main className="dashboard-root">
      <aside className="dashboard-sidebar team-members-sidebar">
        <div className="sidebar-head">
          <h1>HubChat Dashboard</h1>
          <nav className="dashboard-main-nav" aria-label="Workspace">
            <a href="/dashboard" className="dashboard-nav-link">
              Team Inbox
            </a>
            {canManageTeam ? (
              <a href="/dashboard/team-members" className="dashboard-nav-link dashboard-nav-link-active" aria-current="page">
                Team Members
              </a>
            ) : null}
            <a href="/setup" className="secondary-link dashboard-nav-setup">
              Setup
            </a>
          </nav>
        </div>
        {meError ? <div className="card error">{meError}</div> : null}
        <p className="hint team-members-sidebar-hint">Team roster and capacity (read-only in this release).</p>
      </aside>

      <section className="team-members-main">
        {!canManageTeam ? (
          <div className="card team-members-access-denied">
            <h2>Access denied</h2>
            <p className="hint">Team Members is available to Sales Managers and Admins only.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            <header className="team-members-header team-members-header-hero">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Directory</p>
                <h2>Team Members</h2>
                <p className="team-members-subtitle">
                  Manage sales users, sales managers, admins, capacity, and assignment readiness.
                </p>
              </div>
              <button type="button" className="team-members-add-btn" disabled title="Coming in D1-C">
                Add Team Member
              </button>
            </header>

            <div className="team-members-summary" aria-label="Team summary">
              {statCards.map((c) => (
                <div key={c.label} className="team-members-stat-card">
                  <div className="team-members-stat-label">{c.label}</div>
                  <div className="team-members-stat-value">{c.value}</div>
                  <p className="team-members-stat-hint">{c.hint}</p>
                </div>
              ))}
            </div>

            <div className="team-members-filters card">
              <div className="team-members-filters-head">
                <h3 className="team-members-filters-title">Filters</h3>
                {listBusy ? <span className="team-members-refresh-badge">Updating roster…</span> : null}
              </div>
              <div className="team-members-filter-grid">
                <label className="team-members-filter-field">
                  <span className="team-members-filter-label">Search</span>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Name or email"
                    autoComplete="off"
                  />
                </label>
                <label className="team-members-filter-field">
                  <span className="team-members-filter-label">Role</span>
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as TeamMembersRoleFilter)}>
                    <option value="all">All</option>
                    <option value="SALES">Sales</option>
                    <option value="MANAGER">Sales Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
                <label className="team-members-filter-field">
                  <span className="team-members-filter-label">Status</span>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TeamMembersStatusFilter)}>
                    <option value="all">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label className="team-members-filter-field">
                  <span className="team-members-filter-label">Assignment mode</span>
                  <select
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value as TeamMembersAssignmentModeFilter)}
                  >
                    <option value="all">All</option>
                    <option value="AUTO">Auto</option>
                    <option value="MANUAL_ONLY">Manual Only</option>
                    <option value="PAUSED">Paused</option>
                  </select>
                </label>
              </div>
              {listError ? (
                <div className="team-members-inline-error" role="alert">
                  {listError}
                </div>
              ) : null}
            </div>

            <div className={`team-members-table-wrap card ${listBusy ? "team-members-roster-busy" : ""}`}>
              <div className="team-members-roster-head">
                <h3 className="team-members-roster-title">Roster</h3>
                <span className="hint">{members.length} member{members.length === 1 ? "" : "s"}</span>
              </div>
              {listBusy && members.length === 0 ? (
                <div className="team-members-loading-panel" aria-live="polite">
                  <div className="team-members-skeleton-row" />
                  <div className="team-members-skeleton-row" />
                  <div className="team-members-skeleton-row" />
                  <p className="hint team-members-loading-text">Loading team roster…</p>
                </div>
              ) : null}
              {!listBusy && members.length === 0 ? (
                <div className="team-members-empty-state">
                  <p className="team-members-empty-title">No members match</p>
                  <p className="hint">Try clearing filters or adjusting search.</p>
                </div>
              ) : null}
              {members.length > 0 ? (
                <>
                  <div className="team-members-table-scroll team-members-desktop-only">
                    <table className="team-members-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Assignment</th>
                          <th>Capacity</th>
                          <th>Conv.</th>
                          <th>Leads</th>
                          <th>Performance</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <RosterRow key={m.id} m={m} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="team-members-mobile-only team-members-card-stack" aria-label="Team roster (compact)">
                    {members.map((m) => (
                      <MemberCard key={m.id} m={m} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
