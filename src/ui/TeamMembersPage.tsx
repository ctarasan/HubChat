"use client";

import { useEffect, useMemo, useState } from "react";
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

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="setup-wrapper">
        <div className="card">
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
          <div className="card">
            <h2>Access denied</h2>
            <p className="hint">Team Members is available to Sales Managers and Admins only.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            <header className="team-members-header">
              <h2>Team Members</h2>
              <p className="hint team-members-subtitle">
                Manage sales users, sales managers, admins, capacity, and assignment readiness.
              </p>
            </header>

            <div className="team-members-summary" aria-label="Team summary">
              <div className="team-members-stat-card">
                <div className="team-members-stat-value">{summary.totalMembers}</div>
                <div className="team-members-stat-label">Total Members</div>
              </div>
              <div className="team-members-stat-card">
                <div className="team-members-stat-value">{summary.activeSales}</div>
                <div className="team-members-stat-label">Active Sales</div>
              </div>
              <div className="team-members-stat-card">
                <div className="team-members-stat-value">{summary.salesManagers}</div>
                <div className="team-members-stat-label">Sales Managers</div>
              </div>
              <div className="team-members-stat-card">
                <div className="team-members-stat-value">{summary.admins}</div>
                <div className="team-members-stat-label">Admins</div>
              </div>
              <div className="team-members-stat-card">
                <div className="team-members-stat-value">{summary.autoAssignmentEnabled}</div>
                <div className="team-members-stat-label">Auto Assignment Enabled</div>
              </div>
            </div>

            <div className="team-members-filters card">
              <div className="team-members-filter-grid">
                <label>
                  Search
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Name or email"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Role
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as TeamMembersRoleFilter)}>
                    <option value="all">All</option>
                    <option value="SALES">Sales</option>
                    <option value="MANAGER">Sales Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TeamMembersStatusFilter)}>
                    <option value="all">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label>
                  Assignment mode
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
              {listBusy ? <p className="hint">Loading team…</p> : null}
              {listError ? <p className="error-inline">{listError}</p> : null}
            </div>

            <div className="team-members-table-wrap card">
              <div className="team-members-table-scroll">
                <table className="team-members-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Assignment mode</th>
                      <th>Capacity</th>
                      <th>Active conversations</th>
                      <th>Active leads</th>
                      <th>Performance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length === 0 && !listBusy ? (
                      <tr>
                        <td colSpan={10} className="team-members-empty">
                          No team members match the current filters.
                        </td>
                      </tr>
                    ) : null}
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.email}</td>
                        <td>
                          <span className={`team-role-badge team-role-badge-${String(m.role).toLowerCase()}`}>
                            {roleLabel(m.role)}
                          </span>
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
                          <div>{formatCapacityLine(m.activeConversationCount, m.maxActiveConversations)}</div>
                          <div>{formatCapacityLine(m.activeLeadCount, m.maxActiveLeads)}</div>
                          <div className="hint team-members-capacity-hint">Conversations · Leads</div>
                        </td>
                        <td>{m.activeConversationCount}</td>
                        <td>{m.activeLeadCount}</td>
                        <td className="team-members-metrics-cell">
                          <div>Avg Response: —</div>
                          <div>Close Rate: —</div>
                          <div>Satisfaction: —</div>
                          <div>Assignment Score: —</div>
                        </td>
                        <td>
                          <div className="team-members-actions">
                            <button type="button" disabled title="Coming in D1-C">
                              Edit
                            </button>
                            <button type="button" disabled title="Coming in D1-C">
                              Change Role
                            </button>
                            <button type="button" disabled title="Coming in D1-C">
                              Activate / Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
