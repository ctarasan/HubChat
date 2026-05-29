import { computeFollowUpBucket, computeSlaBucket } from "../domain/conversationInboxBuckets.js";
import { parseIsoToDate } from "./inboxBadgeLabels.js";
import { getLeadFunnelStatusLabel } from "./leadStatusEditorModel.js";

export const LEADS_PAGE_LIMIT = 25;

export type LeadsStatusFilter =
  | "all"
  | "NEW"
  | "ASSIGNED"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "UNQUALIFIED";

export type LeadsChannelFilter =
  | "all"
  | "LINE"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "TIKTOK"
  | "SHOPEE"
  | "LAZADA";

export type LeadsOwnerFilter = "all" | "me" | string;

export type LeadsFollowUpFilter = "all" | "overdue" | "today" | "upcoming" | "none";

export type LeadsSlaFilter = "all" | "overdue" | "dueSoon";

export type LeadsListFilters = {
  status: LeadsStatusFilter;
  channel: LeadsChannelFilter;
  owner: LeadsOwnerFilter;
  followUp: LeadsFollowUpFilter;
  sla: LeadsSlaFilter;
  search: string;
};

export const DEFAULT_LEADS_LIST_FILTERS: LeadsListFilters = {
  status: "all",
  channel: "all",
  owner: "all",
  followUp: "all",
  sla: "all",
  search: ""
};

export type LeadPipelineRow = {
  leadId: string;
  conversationId: string | null;
  displayName: string;
  profileImageUrl: string | null;
  channel: string;
  leadStatus: string;
  conversationStatus: string;
  ownerName: string;
  ownerId: string | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  followUpAt: string | null;
  slaDueAt: string | null;
  isFollowUpOverdue: boolean;
  isSlaOverdue: boolean;
  createdAt: string;
};

export type LeadsListPageInfo = {
  nextCursor: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeNullableString(value: unknown): string | null {
  const s = normalizeString(value);
  return s.length > 0 ? s : null;
}

function normalizeBool(value: unknown): boolean {
  return value === true;
}

/** Builds GET /api/leads query per PL-L1 pipeline contract. */
export function buildLeadsListUrl(filters: LeadsListFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  params.set("limit", String(LEADS_PAGE_LIMIT));
  if (cursor) params.set("cursor", cursor);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.channel !== "all") params.set("channel", filters.channel);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  if (filters.followUp !== "all") params.set("followUp", filters.followUp);
  if (filters.sla !== "all") params.set("sla", filters.sla);
  const q = filters.search.trim();
  if (q.length > 0) params.set("search", q);
  return `/api/leads?${params.toString()}`;
}

function mapPipelineRow(raw: Record<string, unknown>): LeadPipelineRow | null {
  const leadId = normalizeString(raw.leadId) || normalizeString(raw.id);
  if (!leadId) return null;
  const displayName =
    normalizeString(raw.displayName) ||
    normalizeString(raw.name) ||
    normalizeString(raw.participantDisplayName) ||
    "Unknown";
  return {
    leadId,
    conversationId: normalizeNullableString(raw.conversationId),
    displayName,
    profileImageUrl: normalizeNullableString(raw.profileImageUrl),
    channel: normalizeString(raw.channel) || normalizeString(raw.sourceChannel) || normalizeString(raw.source_channel) || "LINE",
    leadStatus: normalizeString(raw.leadStatus) || normalizeString(raw.status) || "NEW",
    conversationStatus: normalizeString(raw.conversationStatus) || normalizeString(raw.conversation_status) || "",
    ownerName: normalizeString(raw.ownerName) || normalizeString(raw.owner_name) || "",
    ownerId: normalizeNullableString(raw.ownerId) || normalizeNullableString(raw.owner_id) || normalizeNullableString(raw.assignedSalesId) || normalizeNullableString(raw.assigned_sales_id),
    lastMessagePreview:
      normalizeString(raw.lastMessagePreview) || normalizeString(raw.last_message_preview) || "",
    lastMessageAt:
      normalizeNullableString(raw.lastMessageAt) ||
      normalizeNullableString(raw.last_message_at) ||
      normalizeNullableString(raw.lastContactAt) ||
      normalizeNullableString(raw.last_contact_at),
    followUpAt: normalizeNullableString(raw.followUpAt) || normalizeNullableString(raw.follow_up_at),
    slaDueAt: normalizeNullableString(raw.slaDueAt) || normalizeNullableString(raw.sla_due_at),
    isFollowUpOverdue: normalizeBool(raw.isFollowUpOverdue),
    isSlaOverdue: normalizeBool(raw.isSlaOverdue),
    createdAt:
      normalizeString(raw.createdAt) ||
      normalizeString(raw.created_at) ||
      normalizeString(raw.updatedAt) ||
      normalizeString(raw.updated_at) ||
      ""
  };
}

export function parseLeadsListResponse(
  body: unknown
): { ok: true; items: LeadPipelineRow[]; pageInfo: LeadsListPageInfo } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid leads response." };
  }
  const data = body.data;
  if (!Array.isArray(data)) {
    return { ok: false, error: "Invalid leads response." };
  }
  const items: LeadPipelineRow[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const mapped = mapPipelineRow(row);
    if (mapped) items.push(mapped);
  }
  const pageInfoRaw = isRecord(body.pageInfo) ? body.pageInfo : {};
  const nextCursor =
    typeof pageInfoRaw.nextCursor === "string" && pageInfoRaw.nextCursor.trim()
      ? pageInfoRaw.nextCursor.trim()
      : null;
  return { ok: true, items, pageInfo: { nextCursor } };
}

export function mapLeadsFetchError(status: number, body: unknown): string {
  if (status === 401) return "Session expired. Sign in again.";
  if (status === 403) return "You do not have permission to view leads.";
  if (status === 404) return "Leads API is not available yet.";
  if (isRecord(body)) {
    const err = normalizeString(body.error);
    if (err && err.length <= 160 && !err.toLowerCase().includes("pgrst")) {
      return err;
    }
  }
  if (status >= 500) return "Could not load leads. Try again.";
  return "Could not load leads.";
}

export function formatLeadsDateTime(iso: string | null | undefined, now = new Date()): string {
  const d = iso ? parseIsoToDate(iso) : null;
  if (!d) return "—";
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function formatLeadsCreatedDate(iso: string | null | undefined): string {
  const d = iso ? parseIsoToDate(iso) : null;
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export function getLeadStatusBadgeLabel(status: string): string {
  return getLeadFunnelStatusLabel(status) || status || "—";
}

export type LeadRowBadge = {
  label: string;
  className: string;
};

export function resolveLeadRowFollowUpBadge(row: LeadPipelineRow, now = new Date()): LeadRowBadge | null {
  if (row.isFollowUpOverdue) {
    return { label: "Follow-up overdue", className: "inbox-badge inbox-badge-followup inbox-badge-followup-overdue" };
  }
  const at = row.followUpAt ? parseIsoToDate(row.followUpAt) : null;
  if (!at) return null;
  const bucket = computeFollowUpBucket(now, at);
  if (bucket === "overdue") {
    return { label: "Follow-up overdue", className: "inbox-badge inbox-badge-followup inbox-badge-followup-overdue" };
  }
  if (bucket === "today") {
    return { label: "Follow-up today", className: "inbox-badge inbox-badge-followup inbox-badge-followup-today" };
  }
  if (bucket === "upcoming") {
    return { label: "Follow-up upcoming", className: "inbox-badge inbox-badge-followup inbox-badge-followup-upcoming" };
  }
  return null;
}

export function resolveLeadRowSlaBadge(row: LeadPipelineRow, now = new Date()): LeadRowBadge | null {
  if (row.isSlaOverdue) {
    return { label: "SLA overdue", className: "inbox-badge inbox-badge-sla inbox-badge-sla-overdue" };
  }
  const at = row.slaDueAt ? parseIsoToDate(row.slaDueAt) : null;
  if (!at) return null;
  const bucket = computeSlaBucket(now, at);
  if (bucket === "overdue") {
    return { label: "SLA overdue", className: "inbox-badge inbox-badge-sla inbox-badge-sla-overdue" };
  }
  if (bucket === "dueSoon") {
    return { label: "SLA due soon", className: "inbox-badge inbox-badge-sla inbox-badge-sla-due-soon" };
  }
  return null;
}

export function buildDashboardConversationHref(conversationId: string | null | undefined): string | null {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return null;
  return `/dashboard?conversationId=${encodeURIComponent(id)}`;
}

export function filtersAreDefault(filters: LeadsListFilters): boolean {
  return (
    filters.status === DEFAULT_LEADS_LIST_FILTERS.status &&
    filters.channel === DEFAULT_LEADS_LIST_FILTERS.channel &&
    filters.owner === DEFAULT_LEADS_LIST_FILTERS.owner &&
    filters.followUp === DEFAULT_LEADS_LIST_FILTERS.followUp &&
    filters.sla === DEFAULT_LEADS_LIST_FILTERS.sla &&
    filters.search.trim() === ""
  );
}
