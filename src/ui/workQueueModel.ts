import type {
  WorkflowChannel,
  WorkflowFollowUpCounts,
  WorkflowFollowUpItemDto,
  WorkflowFollowUpItemStatus,
  WorkflowFollowUpStatus,
  WorkflowItemsPageDto,
  WorkflowItemPriority,
  WorkflowScope,
  WorkflowSummaryDto
} from "../domain/workflow.js";
import { WORKFLOW_FOLLOW_UP_ITEM_STATUSES } from "../domain/workflow.js";
import { buildDashboardConversationHref } from "./leadsPageModel.js";
import { getLeadManagementStatusLabel } from "./leadStatusEditorModel.js";

export type { WorkflowScope, WorkflowFollowUpItemStatus, WorkflowFollowUpStatus, WorkflowChannel };

export const WORK_QUEUE_FORBIDDEN_RENDER_KEYS = [
  "follow_up_note",
  "followUpNote",
  "last_message_preview",
  "lastMessagePreview",
  "content",
  "metadata_json",
  "media_url",
  "payload_json",
  "token",
  "secret"
] as const;

export type WorkQueueStatusFilter = "all" | WorkflowFollowUpStatus;

export type WorkQueueChannelFilter = "all" | WorkflowChannel;

export type WorkQueueSummaryCard = {
  id: string;
  label: string;
  hint: string;
  count: number;
  statusFilter: WorkQueueStatusFilter;
  severity: "critical" | "warn" | "info" | "neutral";
};

export type WorkQueueUrlFilters = {
  status?: WorkQueueStatusFilter;
  scope?: WorkflowScope;
};

export function canUseWorkQueueTeamScope(
  role: "SALES" | "MANAGER" | "ADMIN" | null | undefined
): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function defaultWorkQueueScope(role: "SALES" | "MANAGER" | "ADMIN"): WorkflowScope {
  return role === "SALES" ? "mine" : "team";
}

export function resolveWorkQueueScopeForRole(
  role: "SALES" | "MANAGER" | "ADMIN",
  scopeParam: WorkflowScope | undefined
): WorkflowScope {
  if (role === "SALES") return "mine";
  return scopeParam === "mine" ? "mine" : "team";
}

export function buildWorkflowSummaryPath(scope?: WorkflowScope): string {
  const base = "/api/workflow/summary";
  if (!scope) return base;
  return `${base}?scope=${encodeURIComponent(scope)}`;
}

export type BuildWorkflowItemsPathInput = {
  scope?: WorkflowScope;
  status?: WorkflowFollowUpStatus;
  channel?: WorkflowChannel;
  cursor?: string | null;
  limit?: number;
  assignedAgentId?: string;
};

export function buildWorkflowItemsPath(input: BuildWorkflowItemsPathInput): string {
  const params = new URLSearchParams();
  params.set("kind", "follow_up");
  if (input.scope) params.set("scope", input.scope);
  if (input.status) params.set("status", input.status);
  if (input.channel) params.set("channel", input.channel);
  if (input.cursor?.trim()) params.set("cursor", input.cursor.trim());
  if (input.limit != null) params.set("limit", String(input.limit));
  if (input.assignedAgentId?.trim()) params.set("assignedAgentId", input.assignedAgentId.trim());
  return `/api/workflow/items?${params.toString()}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseWorkflowSummaryGetResponse(
  body: unknown
): { ok: true; data: WorkflowSummaryDto } | { ok: false; error: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, error: "Invalid workflow summary response." };
  }
  const data = body.data as WorkflowSummaryDto;
  if (!data.generatedAt || !data.scope || !data.followUp) {
    return { ok: false, error: "Workflow summary response is incomplete." };
  }
  return { ok: true, data };
}

export function parseWorkflowItemsGetResponse(
  body: unknown
): { ok: true; data: WorkflowItemsPageDto } | { ok: false; error: string } {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, error: "Invalid workflow items response." };
  }
  const data = body.data as WorkflowItemsPageDto;
  if (!data.generatedAt || !data.scope || data.kind !== "follow_up" || !Array.isArray(data.items)) {
    return { ok: false, error: "Workflow items response is incomplete." };
  }
  return { ok: true, data };
}

export function mapWorkflowLoadError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "You do not have permission to view this work queue scope.";
  if (status === 400) return "Invalid filter. Adjust scope or status and try again.";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    const msg = body.error.trim();
    if (msg.length > 200) return "Could not load work queue.";
    return msg;
  }
  if (status >= 500) return "Could not load work queue. Please try again.";
  return `Could not load work queue (HTTP ${status}).`;
}

export function formatWorkflowGeneratedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatWorkflowDueAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function workflowStatusLabel(status: WorkflowFollowUpItemStatus): string {
  if (status === "overdue") return "Overdue";
  if (status === "due_today") return "Due today";
  return "Upcoming";
}

export function workflowStatusBadgeClassName(status: WorkflowFollowUpItemStatus): string {
  if (status === "overdue") {
    return "inbox-badge inbox-badge-followup inbox-badge-followup-overdue work-queue-status-badge";
  }
  if (status === "due_today") {
    return "inbox-badge inbox-badge-followup work-queue-status-badge work-queue-status-due-today";
  }
  return "inbox-badge inbox-badge-followup inbox-badge-followup-upcoming work-queue-status-badge";
}

export function workflowPriorityRowClassName(priority: WorkflowItemPriority): string {
  if (priority === "critical") return "work-queue-item work-queue-item-critical";
  if (priority === "warn") return "work-queue-item work-queue-item-warn";
  return "work-queue-item work-queue-item-info";
}

export function workflowChannelLabel(channel: WorkflowChannel): string {
  if (channel === "LINE") return "LINE";
  if (channel === "FACEBOOK") return "Facebook";
  return "Instagram";
}

export function workflowChannelBadgeClassName(channel: WorkflowChannel): string {
  return `channel-badge channel-badge-${channel.toLowerCase()}`;
}

export function formatAssignedAgentDisplay(name: string | null | undefined): string {
  const t = typeof name === "string" ? name.trim() : "";
  return t || "Unassigned";
}

export function summaryCardsFromCounts(counts: WorkflowFollowUpCounts): WorkQueueSummaryCard[] {
  return [
    {
      id: "overdue",
      label: "Overdue",
      hint: "Past scheduled follow-up time",
      count: safeCount(counts.overdue),
      statusFilter: "overdue",
      severity: "critical"
    },
    {
      id: "due-today",
      label: "Due today",
      hint: "Follow-ups due today (UTC day)",
      count: safeCount(counts.dueToday),
      statusFilter: "due_today",
      severity: "warn"
    },
    {
      id: "upcoming",
      label: "Upcoming",
      hint: "Scheduled on a future day",
      count: safeCount(counts.upcoming),
      statusFilter: "upcoming",
      severity: "info"
    },
    {
      id: "scheduled",
      label: "Scheduled",
      hint: "All open follow-ups with a date set",
      count: safeCount(counts.scheduled),
      statusFilter: "scheduled",
      severity: "neutral"
    }
  ];
}

function safeCount(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function isWorkflowFollowUpItemStatus(value: string): value is WorkflowFollowUpItemStatus {
  return (WORKFLOW_FOLLOW_UP_ITEM_STATUSES as readonly string[]).includes(value);
}

/** `scheduled` is a filter/count only — never a row status from the API. */
export function assertWorkQueueItemStatuses(items: WorkflowFollowUpItemDto[]): void {
  for (const item of items) {
    if (!isWorkflowFollowUpItemStatus(item.status)) {
      throw new Error(`Unexpected work queue item status: ${item.status}`);
    }
    if ((item.status as string) === "scheduled") {
      throw new Error("scheduled must not appear as item status");
    }
  }
}

export function assertWorkQueueItemSafeForRender(item: WorkflowFollowUpItemDto): void {
  const json = JSON.stringify(item);
  for (const key of WORK_QUEUE_FORBIDDEN_RENDER_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Work queue item must not expose forbidden field: ${key}`);
    }
  }
}

export function buildWorkQueueInboxHref(conversationId: string): string {
  const href = buildDashboardConversationHref(conversationId);
  return href ?? "/dashboard";
}

export function workQueueEmptyMessage(input: {
  statusFilter: WorkQueueStatusFilter;
  hasActiveChannelFilter: boolean;
}): string {
  if (input.hasActiveChannelFilter) {
    return "No follow-ups match the selected channel filter.";
  }
  if (input.statusFilter === "overdue") return "No overdue follow-ups in this scope.";
  if (input.statusFilter === "due_today") return "No follow-ups due today in this scope.";
  if (input.statusFilter === "upcoming") return "No upcoming follow-ups in this scope.";
  if (input.statusFilter === "scheduled") return "No scheduled follow-ups in this scope.";
  return "No follow-ups need attention in this scope.";
}

export function readWorkQueueUrlFilters(search: string): WorkQueueUrlFilters {
  const params = new URLSearchParams(search);
  const out: WorkQueueUrlFilters = {};
  const status = params.get("status")?.trim();
  if (
    status === "all" ||
    status === "overdue" ||
    status === "due_today" ||
    status === "upcoming" ||
    status === "scheduled"
  ) {
    out.status = status === "all" ? undefined : status;
  }
  const scope = params.get("scope")?.trim();
  if (scope === "mine" || scope === "team") out.scope = scope;
  return out;
}

export function buildWorkQueuePageHref(filters: {
  status?: WorkQueueStatusFilter;
  scope?: WorkflowScope;
}): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.scope) params.set("scope", filters.scope);
  const q = params.toString();
  return q ? `/dashboard/work-queue?${q}` : "/dashboard/work-queue";
}

export function leadManagementStatusDisplay(status: string | null | undefined): string {
  if (!status) return "—";
  return getLeadManagementStatusLabel(status) || status;
}
