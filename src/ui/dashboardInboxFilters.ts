import { computeFollowUpBucket, computeSlaBucket } from "../domain/conversationInboxBuckets.js";
import type { ConversationListFollowUpParam, ConversationListLeadStatusParam, ConversationListSlaParam } from "../interfaces/api/conversationListInboxFilters.js";
import { parseIsoToDate } from "./inboxBadgeLabels.js";
import type { ConversationListStatusFilter, DashboardRole, InboxScopeFilter } from "./teamInboxDashboardHelpers.js";
import { conversationListStatusQueryParamFor, inboxScopeQueryParamFor } from "./teamInboxDashboardHelpers.js";

export type LeadStatusInboxFilter = "all" | ConversationListLeadStatusParam;
export type FollowUpInboxFilter = "all" | ConversationListFollowUpParam;
export type SlaInboxFilter = "all" | ConversationListSlaParam;

export type DashboardInboxFilterState = {
  inboxScope: InboxScopeFilter;
  conversationStatus: ConversationListStatusFilter;
  leadStatus: LeadStatusInboxFilter;
  followUp: FollowUpInboxFilter;
  sla: SlaInboxFilter;
};

export function leadStatusInboxQueryParam(filter: LeadStatusInboxFilter): string {
  if (filter === "all") return "";
  return `&leadStatus=${encodeURIComponent(filter)}`;
}

export function followUpInboxQueryParam(filter: FollowUpInboxFilter): string {
  if (filter === "all") return "";
  return `&followUp=${encodeURIComponent(filter)}`;
}

export function slaInboxQueryParam(filter: SlaInboxFilter): string {
  if (filter === "all") return "";
  return `&sla=${encodeURIComponent(filter)}`;
}

export function buildConversationsListQuerySuffix(
  role: DashboardRole,
  filters: DashboardInboxFilterState
): string {
  return (
    inboxScopeQueryParamFor(role, filters.inboxScope) +
    conversationListStatusQueryParamFor(filters.conversationStatus) +
    leadStatusInboxQueryParam(filters.leadStatus) +
    followUpInboxQueryParam(filters.followUp) +
    slaInboxQueryParam(filters.sla)
  );
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
