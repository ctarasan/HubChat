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
import { pickHttpsProfileImageUrl } from "../lib/contactIdentityFlatten.js";
import {
  initialsAvatarFromDisplayName,
  type ConversationAvatarPlan
} from "./chatComposerModel.js";
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
  "secret",
  "external_user_id",
  "externalUserId"
] as const;

export type WorkQueueStatusFilter = "all" | WorkflowFollowUpStatus;

export type WorkQueueChannelFilter = "all" | WorkflowChannel;

export type WorkQueueIconName =
  | "alert-triangle"
  | "clock"
  | "calendar-days"
  | "calendar-clock"
  | "message-circle"
  | "external-link"
  | "refresh";

export type WorkQueueVisualTone = "critical" | "warn" | "info" | "neutral";

export type WorkQueueSummaryCard = {
  id: string;
  label: string;
  hint: string;
  count: number;
  statusFilter: WorkQueueStatusFilter;
  severity: WorkQueueVisualTone;
  iconName: WorkQueueIconName;
  summaryTestId: string;
  cardClassName: string;
};

export type WorkQueueStatusVisual = {
  label: string;
  tone: WorkQueueVisualTone;
  badgeClassName: string;
  rowClassName: string;
  iconName: WorkQueueIconName;
  statusTestId: string;
};

export type WorkQueueChannelVisual = {
  label: string;
  badgeClassName: string;
  channelTestId: string;
};

export const WORK_QUEUE_CUSTOMER_REPLIED_COPY =
  "Customer replied after this follow-up was scheduled";

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
  connectionScope?: "active" | "all";
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
  if (input.connectionScope === "all") params.set("connectionScope", "all");
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
  return workQueueStatusVisual(status).label;
}

export function workQueueStatusVisual(status: WorkflowFollowUpItemStatus): WorkQueueStatusVisual {
  if (status === "overdue") {
    return {
      label: "Overdue",
      tone: "critical",
      badgeClassName: "work-queue-status-badge work-queue-status-overdue",
      rowClassName: "work-queue-row work-queue-row-critical",
      iconName: "alert-triangle",
      statusTestId: "work-queue-status-overdue"
    };
  }
  if (status === "due_today") {
    return {
      label: "Due today",
      tone: "warn",
      badgeClassName: "work-queue-status-badge work-queue-status-due-today",
      rowClassName: "work-queue-row work-queue-row-warn",
      iconName: "clock",
      statusTestId: "work-queue-status-due-today"
    };
  }
  return {
    label: "Upcoming",
    tone: "info",
    badgeClassName: "work-queue-status-badge work-queue-status-upcoming",
    rowClassName: "work-queue-row work-queue-row-info",
    iconName: "calendar-days",
    statusTestId: "work-queue-status-upcoming"
  };
}

/** @deprecated Use workQueueStatusVisual().badgeClassName */
export function workflowStatusBadgeClassName(status: WorkflowFollowUpItemStatus): string {
  return workQueueStatusVisual(status).badgeClassName;
}

export function workQueueRowClassName(status: WorkflowFollowUpItemStatus): string {
  return workQueueStatusVisual(status).rowClassName;
}

/** Row accent follows follow-up status (not priority alone). */
export function workflowPriorityRowClassName(
  _priority: WorkflowItemPriority,
  status: WorkflowFollowUpItemStatus
): string {
  return workQueueRowClassName(status);
}

export function workflowChannelLabel(channel: WorkflowChannel): string {
  if (channel === "LINE") return "LINE";
  if (channel === "FACEBOOK") return "Facebook";
  return "Instagram";
}

export function workQueueChannelVisual(channel: WorkflowChannel): WorkQueueChannelVisual {
  const key = channel.toLowerCase();
  return {
    label: workflowChannelLabel(channel),
    badgeClassName: `work-queue-channel-badge work-queue-channel-${key}`,
    channelTestId: `work-queue-channel-${key}`
  };
}

/** @deprecated Use workQueueChannelVisual().badgeClassName */
export function workflowChannelBadgeClassName(channel: WorkflowChannel): string {
  return `${workQueueChannelVisual(channel).badgeClassName} channel-badge channel-badge-${channel.toLowerCase()}`;
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
      hint: "Past follow-up time",
      count: safeCount(counts.overdue),
      statusFilter: "overdue",
      severity: "critical",
      iconName: "alert-triangle",
      summaryTestId: "work-queue-summary-overdue",
      cardClassName: "work-queue-summary-card work-queue-summary-critical"
    },
    {
      id: "due-today",
      label: "Due today",
      hint: "Scheduled for today",
      count: safeCount(counts.dueToday),
      statusFilter: "due_today",
      severity: "warn",
      iconName: "clock",
      summaryTestId: "work-queue-summary-due-today",
      cardClassName: "work-queue-summary-card work-queue-summary-warn"
    },
    {
      id: "upcoming",
      label: "Upcoming",
      hint: "Coming next",
      count: safeCount(counts.upcoming),
      statusFilter: "upcoming",
      severity: "info",
      iconName: "calendar-days",
      summaryTestId: "work-queue-summary-upcoming",
      cardClassName: "work-queue-summary-card work-queue-summary-info"
    },
    {
      id: "scheduled",
      label: "Scheduled",
      hint: "All active follow-ups",
      count: safeCount(counts.scheduled),
      statusFilter: "scheduled",
      severity: "neutral",
      iconName: "calendar-clock",
      summaryTestId: "work-queue-summary-scheduled",
      cardClassName: "work-queue-summary-card work-queue-summary-neutral"
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

/** HTTPS-only profile image URL for Work Queue avatars (shared inbox policy). */
export function normalizeWorkQueueProfileImageUrl(value: unknown): string | null {
  return pickHttpsProfileImageUrl(typeof value === "string" ? value : null);
}

export function resolveWorkQueueCustomerAvatarPlan(
  displayName: string,
  profileImageUrl: string | null | undefined
): ConversationAvatarPlan {
  const url = normalizeWorkQueueProfileImageUrl(profileImageUrl);
  if (url) return { kind: "image", url };
  const initials = initialsAvatarFromDisplayName(displayName);
  if (initials) return { kind: "initials", initials };
  return { kind: "generic" };
}
