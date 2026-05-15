"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initialsAvatarFromDisplayName } from "./chatComposerModel.js";
import {
  clearSessionConfig,
  hasRequiredSessionConfig,
  loadSessionConfig,
  type SessionConfig
} from "./sessionConfig.js";
import {
  buildCreateTeamMemberApiPayload,
  buildPatchTeamMemberBody,
  canDeactivateTeamMemberRow,
  canManageTeamMemberRow,
  createDefaultTeamMemberForm,
  getRoleOptionsForForm,
  rowToForm,
  validateTeamMemberForm,
  type TeamMemberFormDraft,
  type TeamMemberRowSnapshot
} from "./teamMemberFormModel.js";
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

const PROVISIONING_AFTER_CREATE =
  "Team member row created. Sign-in access requires separate user provisioning.";
const PROVISIONING_WITH_AUTH = "Team member and login account created.";

type DrawerMode = "closed" | "create" | "edit";

function rowSnapshot(m: TeamMemberApiRow): TeamMemberRowSnapshot {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    status: m.status,
    assignmentEnabled: m.assignmentEnabled,
    assignmentMode: m.assignmentMode,
    maxActiveConversations: m.maxActiveConversations,
    maxActiveLeads: m.maxActiveLeads
  };
}

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

function RosterActions({
  m,
  me,
  rowBusy,
  onEdit,
  onActivate,
  onDeactivate
}: {
  m: TeamMemberApiRow;
  me: MeContext;
  rowBusy: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const manage = canManageTeamMemberRow(me, m);
  const canDeact = canDeactivateTeamMemberRow(me, m);
  const selfBlock = Boolean(me.salesAgentId && me.salesAgentId === m.id);
  return (
    <div className="team-members-action-row" role="group" aria-label="Member actions">
      <button
        type="button"
        className="team-members-chip-btn"
        disabled={!manage || rowBusy}
        title={!manage ? "Managers can only edit Sales users." : undefined}
        onClick={onEdit}
      >
        Edit
      </button>
      {m.status === "ACTIVE" ? (
        <button
          type="button"
          className="team-members-chip-btn"
          disabled={!canDeact || rowBusy}
          title={selfBlock ? "You cannot deactivate your own account." : undefined}
          onClick={onDeactivate}
        >
          Deactivate
        </button>
      ) : (
        <button
          type="button"
          className="team-members-chip-btn"
          disabled={!manage || rowBusy}
          title={!manage ? "Managers can only edit Sales users." : undefined}
          onClick={onActivate}
        >
          Activate
        </button>
      )}
    </div>
  );
}

function RosterRow({
  m,
  me,
  rowBusy,
  onEdit,
  onActivate,
  onDeactivate
}: {
  m: TeamMemberApiRow;
  me: MeContext;
  rowBusy: boolean;
  onEdit: (row: TeamMemberApiRow) => void;
  onActivate: (row: TeamMemberApiRow) => void;
  onDeactivate: (row: TeamMemberApiRow) => void;
}) {
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
        <RosterActions
          m={m}
          me={me}
          rowBusy={rowBusy}
          onEdit={() => onEdit(m)}
          onActivate={() => onActivate(m)}
          onDeactivate={() => onDeactivate(m)}
        />
      </td>
    </tr>
  );
}

function MemberCard({
  m,
  me,
  rowBusy,
  onEdit,
  onActivate,
  onDeactivate
}: {
  m: TeamMemberApiRow;
  me: MeContext;
  rowBusy: boolean;
  onEdit: (row: TeamMemberApiRow) => void;
  onActivate: (row: TeamMemberApiRow) => void;
  onDeactivate: (row: TeamMemberApiRow) => void;
}) {
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
      <RosterActions
        m={m}
        me={me}
        rowBusy={rowBusy}
        onEdit={() => onEdit(m)}
        onActivate={() => onActivate(m)}
        onDeactivate={() => onDeactivate(m)}
      />
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

  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  const [originalMember, setOriginalMember] = useState<TeamMemberRowSnapshot | null>(null);
  const [form, setForm] = useState<TeamMemberFormDraft>(createDefaultTeamMemberForm("ADMIN"));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [drawerApiError, setDrawerApiError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [rowActionBusyId, setRowActionBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  useEffect(() => {
    const id = globalThis.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => globalThis.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!banner) return;
    const t = globalThis.setTimeout(() => setBanner(null), 7000);
    return () => globalThis.clearTimeout(t);
  }, [banner]);

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

  async function apiJson(path: string, method: string, body?: unknown): Promise<any> {
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) {
      throw new Error("Missing session configuration");
    }
    const res = await fetch(`${s.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        "x-tenant-id": s.tenantId,
        "Content-Type": "application/json"
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
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

  const loadMembers = useCallback(async () => {
    const s = session;
    if (!s || !hasRequiredSessionConfig(s)) return;
    const me = meContext;
    if (!me || meError) return;
    if (me.role !== "MANAGER" && me.role !== "ADMIN") return;
    setListBusy(true);
    setListError("");
    try {
      const res = await fetch(`${s.baseUrl}${listPath}`, {
        headers: {
          Authorization: `Bearer ${s.accessToken}`,
          "x-tenant-id": s.tenantId
        }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof json?.error === "string" ? json.error : res.statusText;
        throw new Error(err || `Request failed (${res.status})`);
      }
      setMembers((json?.data ?? []) as TeamMemberApiRow[]);
    } catch (e) {
      setMembers([]);
      setListError(String(e instanceof Error ? e.message : e));
    } finally {
      setListBusy(false);
    }
  }, [session, meContext, meError, listPath]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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

  function closeDrawer() {
    setDrawerMode("closed");
    setDrawerMemberId(null);
    setOriginalMember(null);
    setDrawerApiError("");
    setFormErrors({});
    setSaveBusy(false);
  }

  function openCreate() {
    if (!meContext) return;
    const actor: "MANAGER" | "ADMIN" = meContext.role === "MANAGER" ? "MANAGER" : "ADMIN";
    setForm(createDefaultTeamMemberForm(actor));
    setOriginalMember(null);
    setDrawerMemberId(null);
    setDrawerMode("create");
    setDrawerApiError("");
    setFormErrors({});
  }

  function openEdit(m: TeamMemberApiRow) {
    setForm(rowToForm(rowSnapshot(m)));
    setOriginalMember(rowSnapshot(m));
    setDrawerMemberId(m.id);
    setDrawerMode("edit");
    setDrawerApiError("");
    setFormErrors({});
  }

  async function saveDrawer() {
    if (!meContext) return;
    const v = validateTeamMemberForm(form, { isCreate: drawerMode === "create" });
    if (!v.ok) {
      setFormErrors(v.errors);
      return;
    }
    setFormErrors({});
    setDrawerApiError("");
    setSaveBusy(true);
    try {
      if (drawerMode === "create") {
        const actor: "MANAGER" | "ADMIN" = meContext.role === "MANAGER" ? "MANAGER" : "ADMIN";
        const createdWithAuth = form.createAuthUser;
        const body = buildCreateTeamMemberApiPayload(actor, form);
        await apiJson("/api/sales-agents", "POST", body);
        setBanner({
          text: createdWithAuth ? PROVISIONING_WITH_AUTH : PROVISIONING_AFTER_CREATE,
          kind: "success"
        });
        closeDrawer();
        await loadMembers();
      } else if (drawerMode === "edit" && originalMember && drawerMemberId) {
        const patch = buildPatchTeamMemberBody(originalMember, form);
        if (!patch) {
          setDrawerApiError("No changes to save.");
          return;
        }
        await apiJson(`/api/sales-agents/${encodeURIComponent(drawerMemberId)}`, "PATCH", patch);
        setBanner({ text: "Team member updated.", kind: "success" });
        closeDrawer();
        await loadMembers();
      }
    } catch (e) {
      setDrawerApiError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaveBusy(false);
    }
  }

  async function patchStatus(m: TeamMemberApiRow, status: "ACTIVE" | "INACTIVE") {
    setRowActionBusyId(m.id);
    setBanner(null);
    try {
      await apiJson(`/api/sales-agents/${encodeURIComponent(m.id)}`, "PATCH", { status });
      setBanner({
        text: status === "ACTIVE" ? "Member activated." : "Member deactivated.",
        kind: "success"
      });
      await loadMembers();
    } catch (e) {
      setBanner({ text: String(e instanceof Error ? e.message : e), kind: "error" });
    } finally {
      setRowActionBusyId(null);
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
          <p className="hint">
            <a href="/setup" className="secondary-link">
              Advanced setup
            </a>
          </p>
        </div>
      </main>
    );
  }

  const canManageTeam = meContext && (meContext.role === "MANAGER" || meContext.role === "ADMIN");
  const drawerOpen = drawerMode !== "closed";
  const roleOptions = meContext ? getRoleOptionsForForm(meContext.role === "MANAGER" ? "MANAGER" : "ADMIN") : [];

  return (
    <main className="dashboard-root">
      <aside className="dashboard-sidebar team-members-sidebar">
        <div className="sidebar-head">
          <h1>HubChat Dashboard</h1>
          <nav className="dashboard-main-nav" aria-label="Workspace">
            <a href="/dashboard" className="dashboard-nav-link" data-testid="nav-team-inbox">
              Team Inbox
            </a>
            {canManageTeam ? (
              <a
                href="/dashboard/team-members"
                className="dashboard-nav-link dashboard-nav-link-active"
                aria-current="page"
                data-testid="nav-team-members"
              >
                Team Members
              </a>
            ) : null}
            <button
              type="button"
              className="secondary-link dashboard-nav-setup team-members-sign-out"
              data-testid="team-members-sign-out"
              onClick={() => {
                clearSessionConfig(globalThis.localStorage);
                window.location.replace("/login");
              }}
            >
              Sign out
            </button>
            <a href="/setup" className="secondary-link dashboard-nav-setup">
              Setup
            </a>
          </nav>
        </div>
        {meError ? <div className="card error">{meError}</div> : null}
        <p className="hint team-members-sidebar-hint">Team roster, capacity, and member management.</p>
      </aside>

      <section className="team-members-main">
        {!canManageTeam || !meContext ? (
          <div className="card team-members-access-denied" data-testid="team-members-access-denied">
            <h2>Access denied</h2>
            <p className="hint">Team Members is available to Sales Managers and Admins only.</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : (
          <>
            {banner ? (
              <div
                className={`team-members-banner ${banner.kind === "success" ? "team-members-banner-success" : "team-members-banner-error"}`}
                data-testid="team-members-banner"
                role="status"
              >
                {banner.text}
              </div>
            ) : null}

            <header className="team-members-header team-members-header-hero">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Directory</p>
                <h2>Team Members</h2>
                <p className="team-members-subtitle">
                  Manage sales users, sales managers, admins, capacity, and assignment readiness.
                </p>
              </div>
              <button type="button" className="team-members-add-btn" data-testid="team-members-add" onClick={openCreate}>
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
                <div
                  className="team-members-roster-scroll"
                  data-testid="team-members-roster-scroll"
                  aria-label="Team roster"
                >
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
                          <RosterRow
                            key={m.id}
                            m={m}
                            me={meContext}
                            rowBusy={rowActionBusyId === m.id}
                            onEdit={openEdit}
                            onActivate={(row) => void patchStatus(row, "ACTIVE")}
                            onDeactivate={(row) => void patchStatus(row, "INACTIVE")}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="team-members-mobile-only team-members-card-stack" aria-label="Team roster (compact)">
                    {members.map((m) => (
                      <MemberCard
                        key={m.id}
                        m={m}
                        me={meContext}
                        rowBusy={rowActionBusyId === m.id}
                        onEdit={openEdit}
                        onActivate={(row) => void patchStatus(row, "ACTIVE")}
                        onDeactivate={(row) => void patchStatus(row, "INACTIVE")}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {drawerOpen ? (
              <div className="team-members-drawer-root">
                <button type="button" className="team-members-drawer-scrim" aria-label="Close drawer" onClick={closeDrawer} />
                <div
                  className="team-members-drawer-panel"
                  data-testid="team-member-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="team-members-drawer-title"
                >
                  <div className="team-members-drawer-head">
                    <h3 id="team-members-drawer-title" className="team-members-drawer-title">
                      {drawerMode === "create" ? "Add team member" : "Edit team member"}
                    </h3>
                    <button type="button" className="team-members-drawer-close secondary-link" onClick={closeDrawer}>
                      Close
                    </button>
                  </div>
                  {drawerApiError ? <div className="team-members-drawer-error">{drawerApiError}</div> : null}
                  <form
                    className="team-members-drawer-body"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveDrawer();
                    }}
                  >
                    <div className="team-members-drawer-section">
                      <h4 className="team-members-drawer-section-title">Profile</h4>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Name</span>
                        <input
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          autoComplete="name"
                        />
                        {formErrors.name ? <p className="team-members-field-error">{formErrors.name}</p> : null}
                      </label>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Email</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          autoComplete="email"
                        />
                        {formErrors.email ? <p className="team-members-field-error">{formErrors.email}</p> : null}
                      </label>
                    </div>
                    <div className="team-members-drawer-section">
                      <h4 className="team-members-drawer-section-title">Role &amp; access</h4>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Role</span>
                        <select
                          value={form.role}
                          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as TeamMemberFormDraft["role"] }))}
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Status</span>
                        <select
                          value={form.status}
                          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TeamMemberFormDraft["status"] }))}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </label>
                    </div>
                    {drawerMode === "create" ? (
                      <div className="team-members-drawer-section">
                        <h4 className="team-members-drawer-section-title">Login account</h4>
                        <p className="hint team-members-drawer-cap-hint">
                          Create a password so this person can sign in with their email.
                        </p>
                        <label className="team-members-filter-field team-members-checkbox-row">
                          <span className="team-members-filter-label">Create login account</span>
                          <input
                            type="checkbox"
                            data-testid="team-member-create-auth"
                            checked={form.createAuthUser}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                createAuthUser: e.target.checked,
                                passwordInput: e.target.checked ? f.passwordInput : "",
                                confirmPasswordInput: e.target.checked ? f.confirmPasswordInput : ""
                              }))
                            }
                          />
                        </label>
                        {form.createAuthUser ? (
                          <>
                            <label className="team-members-filter-field">
                              <span className="team-members-filter-label">Password</span>
                              <input
                                type="password"
                                data-testid="team-member-new-password"
                                value={form.passwordInput}
                                onChange={(e) => setForm((f) => ({ ...f, passwordInput: e.target.value }))}
                                autoComplete="new-password"
                              />
                              {formErrors.passwordInput ? (
                                <p className="team-members-field-error">{formErrors.passwordInput}</p>
                              ) : null}
                            </label>
                            <label className="team-members-filter-field">
                              <span className="team-members-filter-label">Confirm password</span>
                              <input
                                type="password"
                                data-testid="team-member-confirm-password"
                                value={form.confirmPasswordInput}
                                onChange={(e) => setForm((f) => ({ ...f, confirmPasswordInput: e.target.value }))}
                                autoComplete="new-password"
                              />
                              {formErrors.confirmPasswordInput ? (
                                <p className="team-members-field-error">{formErrors.confirmPasswordInput}</p>
                              ) : null}
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="team-members-drawer-section">
                      <h4 className="team-members-drawer-section-title">Assignment settings</h4>
                      <label className="team-members-filter-field team-members-checkbox-row">
                        <span className="team-members-filter-label">Assignment enabled</span>
                        <input
                          type="checkbox"
                          checked={form.assignmentEnabled}
                          onChange={(e) => setForm((f) => ({ ...f, assignmentEnabled: e.target.checked }))}
                        />
                      </label>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Assignment mode</span>
                        <select
                          value={form.assignmentMode}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, assignmentMode: e.target.value as TeamMemberFormDraft["assignmentMode"] }))
                          }
                        >
                          <option value="AUTO">Auto</option>
                          <option value="MANUAL_ONLY">Manual Only</option>
                          <option value="PAUSED">Paused</option>
                        </select>
                      </label>
                    </div>
                    <div className="team-members-drawer-section">
                      <h4 className="team-members-drawer-section-title">Capacity limits</h4>
                      <p className="hint team-members-drawer-cap-hint">Leave empty for unlimited. Whole numbers 0 or greater.</p>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Max active conversations</span>
                        <input
                          inputMode="numeric"
                          value={form.maxActiveConversationsInput}
                          onChange={(e) => setForm((f) => ({ ...f, maxActiveConversationsInput: e.target.value }))}
                        />
                        {formErrors.maxActiveConversations ? (
                          <p className="team-members-field-error">{formErrors.maxActiveConversations}</p>
                        ) : null}
                      </label>
                      <label className="team-members-filter-field">
                        <span className="team-members-filter-label">Max active leads</span>
                        <input
                          inputMode="numeric"
                          value={form.maxActiveLeadsInput}
                          onChange={(e) => setForm((f) => ({ ...f, maxActiveLeadsInput: e.target.value }))}
                        />
                        {formErrors.maxActiveLeads ? <p className="team-members-field-error">{formErrors.maxActiveLeads}</p> : null}
                      </label>
                    </div>
                    <div className="team-members-drawer-footer">
                      <button type="button" className="secondary-link team-members-drawer-cancel" onClick={closeDrawer}>
                        Cancel
                      </button>
                      <button type="submit" className="team-members-add-btn" data-testid="team-member-drawer-save" disabled={saveBusy}>
                        {saveBusy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
