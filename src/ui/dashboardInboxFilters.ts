import { computeFollowUpBucket, computeSlaBucket } from "../domain/conversationInboxBuckets.js";
import { parseIsoToDate } from "./inboxBadgeLabels.js";
import type { DashboardRole } from "./teamInboxDashboardHelpers.js";

/** Frozen GET /api/conversations query contract (Phase II-D2.1). */
export type InboxScopeFilter = "all" | "mine" | "team" | "unassigned";
export type ChannelFilter = "all" | "LINE" | "FACEBOOK" | "INSTAGRAM";
export type ConversationStatusFilter = "all" | "OPEN" | "PENDING" | "RESOLVED";
export type LeadManagementStatusFilter =
  | "all"
  | "NEW"
  | "IN_PROGRESS"
  | "FOLLOW_UP"
  | "WON"
  | "LOST"
  | "CLOSED";
export type FollowUpFilter = "all" | "scheduled" | "today" | "overdue" | "none";
export type SlaFilter = "all" | "active" | "due_soon" | "overdue" | "none";
export type WaitingFilter = "all" | "needs_response" | "waiting_customer";

export type DashboardInboxFilterState = {
  scope: InboxScopeFilter;
  channel: ChannelFilter;
  conversationStatus: ConversationStatusFilter;
  leadManagementStatus: LeadManagementStatusFilter;
  followUp: FollowUpFilter;
  sla: SlaFilter;
  waiting: WaitingFilter;
  assignedAgentId: string | null;
};

export type InboxActionFilterPreset =
  | "needs_response"
  | "sla_overdue"
  | "sla_due_soon"
  | "follow_up_today"
  | "follow_up_overdue";

export type ActiveFilterBadge = {
  key: string;
  label: string;
  clearPatch: Partial<DashboardInboxFilterState>;
};

export const DEFAULT_DASHBOARD_INBOX_FILTERS: DashboardInboxFilterState = {
  scope: "all",
  channel: "all",
  conversationStatus: "all",
  leadManagementStatus: "all",
  followUp: "all",
  sla: "all",
  waiting: "all",
  assignedAgentId: null
};

export function defaultDashboardInboxFiltersForRole(role: DashboardRole | undefined): DashboardInboxFilterState {
  if (role === "SALES") {
    return { ...DEFAULT_DASHBOARD_INBOX_FILTERS, scope: "mine" };
  }
  return { ...DEFAULT_DASHBOARD_INBOX_FILTERS };
}

export function canUseInboxScope(role: DashboardRole | undefined, scope: InboxScopeFilter): boolean {
  if (role === "SALES") return scope === "mine";
  if (role === "MANAGER" || role === "ADMIN") return true;
  return scope === "mine";
}

export function scopeQueryParam(role: DashboardRole | undefined, scope: InboxScopeFilter): string {
  const effective = canUseInboxScope(role, scope) ? scope : "mine";
  if (effective === "all") return "&scope=all";
  return `&scope=${encodeURIComponent(effective)}`;
}

export function channelQueryParam(channel: ChannelFilter): string {
  if (channel === "all") return "";
  return `&channel=${encodeURIComponent(channel)}`;
}

export function conversationStatusQueryParam(status: ConversationStatusFilter): string {
  if (status === "all") return "";
  return `&conversationStatus=${encodeURIComponent(status)}`;
}

export function leadManagementStatusQueryParam(status: LeadManagementStatusFilter): string {
  if (status === "all") return "";
  return `&leadManagementStatus=${encodeURIComponent(status)}`;
}

export function followUpQueryParam(followUp: FollowUpFilter): string {
  if (followUp === "all") return "";
  return `&followUp=${encodeURIComponent(followUp)}`;
}

export function slaQueryParam(sla: SlaFilter): string {
  if (sla === "all") return "";
  return `&sla=${encodeURIComponent(sla)}`;
}

export function waitingQueryParam(waiting: WaitingFilter): string {
  if (waiting === "all") return "";
  return `&waiting=${encodeURIComponent(waiting)}`;
}

export function assignedAgentIdQueryParam(agentId: string | null | undefined): string {
  if (!agentId?.trim()) return "";
  return `&assignedAgentId=${encodeURIComponent(agentId.trim())}`;
}

export function buildConversationsListQuerySuffix(
  role: DashboardRole | undefined,
  filters: DashboardInboxFilterState
): string {
  return (
    scopeQueryParam(role, filters.scope) +
    channelQueryParam(filters.channel) +
    conversationStatusQueryParam(filters.conversationStatus) +
    leadManagementStatusQueryParam(filters.leadManagementStatus) +
    followUpQueryParam(filters.followUp) +
    slaQueryParam(filters.sla) +
    waitingQueryParam(filters.waiting) +
    assignedAgentIdQueryParam(filters.assignedAgentId)
  );
}

export function applyActionFilterPreset(preset: InboxActionFilterPreset): Partial<DashboardInboxFilterState> {
  if (preset === "needs_response") return { waiting: "needs_response" };
  if (preset === "sla_overdue") return { sla: "overdue" };
  if (preset === "sla_due_soon") return { sla: "due_soon" };
  if (preset === "follow_up_today") return { followUp: "today" };
  return { followUp: "overdue" };
}

export function mergeInboxFilters(
  current: DashboardInboxFilterState,
  patch: Partial<DashboardInboxFilterState>
): DashboardInboxFilterState {
  return { ...current, ...patch };
}

export function clearAllInboxFilters(role: DashboardRole | undefined): DashboardInboxFilterState {
  return defaultDashboardInboxFiltersForRole(role);
}

function isFilterActive(
  role: DashboardRole | undefined,
  filters: DashboardInboxFilterState,
  key: keyof DashboardInboxFilterState
): boolean {
  const defaults = defaultDashboardInboxFiltersForRole(role);
  if (key === "assignedAgentId") {
    return Boolean(filters.assignedAgentId?.trim());
  }
  return filters[key] !== defaults[key];
}

export function listActiveFilterBadges(
  role: DashboardRole | undefined,
  filters: DashboardInboxFilterState
): ActiveFilterBadge[] {
  const badges: ActiveFilterBadge[] = [];
  const defaults = defaultDashboardInboxFiltersForRole(role);

  if (isFilterActive(role, filters, "scope")) {
    const scopeLabels: Record<InboxScopeFilter, string> = {
      all: "All",
      mine: "My inbox",
      team: "Team inbox",
      unassigned: "Unassigned"
    };
    badges.push({ key: "scope", label: scopeLabels[filters.scope], clearPatch: { scope: defaults.scope } });
  }
  if (filters.channel !== "all") {
    const channelLabels: Record<Exclude<ChannelFilter, "all">, string> = {
      LINE: "LINE",
      FACEBOOK: "Facebook",
      INSTAGRAM: "Instagram"
    };
    badges.push({
      key: "channel",
      label: channelLabels[filters.channel],
      clearPatch: { channel: "all" }
    });
  }
  if (filters.conversationStatus !== "all") {
    badges.push({
      key: "conversationStatus",
      label: filters.conversationStatus,
      clearPatch: { conversationStatus: "all" }
    });
  }
  if (filters.leadManagementStatus !== "all") {
    const leadLabels: Record<Exclude<LeadManagementStatusFilter, "all">, string> = {
      NEW: "New",
      IN_PROGRESS: "In progress",
      FOLLOW_UP: "Follow-up",
      WON: "Won",
      LOST: "Lost",
      CLOSED: "Closed"
    };
    badges.push({
      key: "leadManagementStatus",
      label: leadLabels[filters.leadManagementStatus],
      clearPatch: { leadManagementStatus: "all" }
    });
  }
  if (filters.followUp !== "all") {
    badges.push({ key: "followUp", label: `Follow-up: ${filters.followUp}`, clearPatch: { followUp: "all" } });
  }
  if (filters.sla !== "all") {
    badges.push({ key: "sla", label: `SLA: ${filters.sla}`, clearPatch: { sla: "all" } });
  }
  if (filters.waiting !== "all") {
    const waitingLabels: Record<Exclude<WaitingFilter, "all">, string> = {
      needs_response: "Needs response",
      waiting_customer: "Waiting on customer"
    };
    badges.push({
      key: "waiting",
      label: waitingLabels[filters.waiting],
      clearPatch: { waiting: "all" }
    });
  }
  if (filters.assignedAgentId?.trim()) {
    badges.push({
      key: "assignedAgentId",
      label: "Assigned agent",
      clearPatch: { assignedAgentId: null }
    });
  }
  return badges;
}

export function hasActiveInboxFilters(
  role: DashboardRole | undefined,
  filters: DashboardInboxFilterState
): boolean {
  return listActiveFilterBadges(role, filters).length > 0;
}

export type InboxFirstPageSummary = {
  unassigned: number;
  myAssigned: number;
  slaOverdue: number;
  followUpAction: number;
};

type SummaryRow = {
  assigned_agent_id?: string | null;
  assignedAgentId?: string | null;
  sla_due_at?: string | null;
  follow_up_at?: string | null;
};

function assignedId(row: SummaryRow): string | null {
  const raw = row.assigned_agent_id ?? row.assignedAgentId ?? null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** Cheap counts from the currently loaded first page only (not tenant-wide metrics). */
export function computeInboxFirstPageSummary(
  rows: SummaryRow[],
  now: Date,
  mySalesAgentId: string | null | undefined
): InboxFirstPageSummary {
  let unassigned = 0;
  let myAssigned = 0;
  let slaOverdue = 0;
  let followUpAction = 0;
  const me = typeof mySalesAgentId === "string" && mySalesAgentId.trim() ? mySalesAgentId.trim() : null;

  for (const row of rows) {
    const aid = assignedId(row);
    if (!aid) unassigned += 1;
    else if (me && aid === me) myAssigned += 1;

    const slaAt = parseIsoToDate(row.sla_due_at ?? null);
    if (slaAt && computeSlaBucket(now, slaAt) === "overdue") slaOverdue += 1;

    const fuAt = parseIsoToDate(row.follow_up_at ?? null);
    const fuBucket = fuAt ? computeFollowUpBucket(now, fuAt) : "none";
    if (fuBucket === "overdue" || fuBucket === "today") followUpAction += 1;
  }

  return { unassigned, myAssigned, slaOverdue, followUpAction };
}
