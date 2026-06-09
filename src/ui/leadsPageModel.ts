import { computeFollowUpBucket, computeSlaBucket } from "../domain/conversationInboxBuckets.js";
import {
  readListSlaWarningBeforeBreachMinutes,
  resolveSlaDueSoonMsFromBadgeOptions,
  type InboxBadgeSlaOptions
} from "../interfaces/api/listSlaPageInfo.js";
import {
  resolveConversationParticipantName,
  type ConversationParticipantFallbackRow
} from "./chatComposerModel.js";
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

export type LeadInboxState = "ACTIVE" | "ARCHIVED" | "PURGED" | "UNKNOWN";

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
  /** Optional lifecycle fields (forward-compatible with Agent A API). */
  inboxState?: LeadInboxState;
  canOpenInbox?: boolean;
  canReopenInbox?: boolean;
  conversationArchivedAt?: string | null;
  historyPurgedAt?: string | null;
  mediaPurgedAt?: string | null;
  retentionLabel?: string | null;
  /** PR #196 GET /api/leads source classification. */
  sourceType?: string | null;
  sourceLabel?: string | null;
  hasCommentContext?: boolean;
  hasPrivateReply?: boolean;
};

export type LeadInboxActionState = {
  canOpen: boolean;
  href: string | null;
  statusLabel: string | null;
  statusClassName: string;
  helperText: string | null;
};

export type LeadsListPageInfo = {
  nextCursor: string | null;
  hasNextPage: boolean;
  slaWarningBeforeBreachMinutes?: number | null;
};

export type { InboxBadgeSlaOptions as LeadRowSlaBadgeOptions };

function readLeadsNextCursorValue(source: unknown): string | null {
  if (!isRecord(source)) return null;
  for (const key of ["nextCursor", "next_cursor", "cursor"] as const) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Reads GET /api/leads pageInfo from common response shapes (camelCase and snake_case). */
export function extractLeadsListPageInfo(body: Record<string, unknown>): LeadsListPageInfo {
  const pageInfoRaw = isRecord(body.pageInfo)
    ? body.pageInfo
    : isRecord(body.page_info)
      ? body.page_info
      : null;
  const nextCursor = readLeadsNextCursorValue(pageInfoRaw) ?? readLeadsNextCursorValue(body);
  const hasNextPage =
    pageInfoRaw?.hasNextPage === true ||
    pageInfoRaw?.has_next_page === true ||
    nextCursor != null;
  const slaWarningBeforeBreachMinutes = readListSlaWarningBeforeBreachMinutes(pageInfoRaw);
  return { nextCursor, hasNextPage, slaWarningBeforeBreachMinutes };
}

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

/** Non-empty profile image URL from API row, or null for initials fallback. */
export function normalizeLeadsProfileImageUrl(value: unknown): string | null {
  return normalizeNullableString(value);
}

function normalizeBool(value: unknown): boolean {
  return value === true;
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

function parseLeadInboxState(value: unknown): LeadInboxState {
  const normalized = normalizeString(value).toUpperCase();
  if (normalized === "ACTIVE" || normalized === "ARCHIVED" || normalized === "PURGED" || normalized === "UNKNOWN") {
    return normalized;
  }
  return "UNKNOWN";
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const s = normalizeString(value);
    if (s) return s;
  }
  return null;
}

/** Shorten long external/thread ids for display (Inbox-style preview). */
export function shortenLeadIdentityPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 12)}…`;
}

function leadApiRowToParticipantFallback(raw: Record<string, unknown>): ConversationParticipantFallbackRow {
  const contacts = isRecord(raw.contacts) ? raw.contacts : null;
  return {
    participantDisplayName: pickFirstNonEmpty(
      raw.displayName,
      raw.display_name,
      raw.name,
      raw.participantDisplayName,
      raw.participant_display_name
    ),
    contactIdentityDisplayName: pickFirstNonEmpty(
      raw.identityLabel,
      raw.identity_label,
      raw.fallbackDisplayName,
      raw.fallback_display_name,
      raw.contactIdentityDisplayName,
      raw.contact_identity_display_name
    ),
    contacts: contacts
      ? {
          display_name: pickFirstNonEmpty(contacts.display_name, contacts.displayName),
          displayName: pickFirstNonEmpty(contacts.displayName, contacts.display_name)
        }
      : null,
    external_user_id: pickFirstNonEmpty(
      raw.externalUserIdPreview,
      raw.external_user_id_preview,
      raw.externalUserId,
      raw.external_user_id,
      raw.providerExternalUserId,
      raw.provider_external_user_id
    ),
    channel_thread_id: pickFirstNonEmpty(
      raw.channelThreadIdPreview,
      raw.channel_thread_id_preview,
      raw.channelThreadId,
      raw.channel_thread_id
    )
  };
}

/**
 * Resolves the visible lead label for Leads table rows (aligned with Inbox identity fallback).
 * Order: displayName → identityLabel/fallbackDisplayName → shortened external/thread preview → Unknown.
 */
export function resolveLeadDisplayLabel(raw: Record<string, unknown>): string {
  const displayName = pickFirstNonEmpty(
    raw.displayName,
    raw.display_name,
    raw.name,
    raw.participantDisplayName,
    raw.participant_display_name
  );
  if (displayName) return displayName;

  const identity = pickFirstNonEmpty(
    raw.identityLabel,
    raw.identity_label,
    raw.fallbackDisplayName,
    raw.fallback_display_name,
    raw.contactIdentityDisplayName,
    raw.contact_identity_display_name
  );
  if (identity) return identity;

  const externalPreview = pickFirstNonEmpty(raw.externalUserIdPreview, raw.external_user_id_preview);
  if (externalPreview) return shortenLeadIdentityPreview(externalPreview);

  const external = pickFirstNonEmpty(
    raw.externalUserId,
    raw.external_user_id,
    raw.providerExternalUserId,
    raw.provider_external_user_id
  );
  if (external) return shortenLeadIdentityPreview(external);

  const threadPreview = pickFirstNonEmpty(raw.channelThreadIdPreview, raw.channel_thread_id_preview);
  if (threadPreview) return shortenLeadIdentityPreview(threadPreview);

  const thread = pickFirstNonEmpty(raw.channelThreadId, raw.channel_thread_id);
  if (thread) return shortenLeadIdentityPreview(thread);

  const inboxStyle = resolveConversationParticipantName(leadApiRowToParticipantFallback(raw));
  if (inboxStyle !== "Unknown User") {
    return inboxStyle.length > 16 ? shortenLeadIdentityPreview(inboxStyle) : inboxStyle;
  }

  return "Unknown";
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
  const displayName = resolveLeadDisplayLabel(raw);
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
      "",
    inboxState: parseLeadInboxState(raw.inboxState ?? raw.inbox_state),
    canOpenInbox: parseOptionalBool(raw.canOpenInbox ?? raw.can_open_inbox),
    canReopenInbox: parseOptionalBool(raw.canReopenInbox ?? raw.can_reopen_inbox),
    conversationArchivedAt: normalizeNullableString(raw.conversationArchivedAt ?? raw.conversation_archived_at),
    historyPurgedAt: normalizeNullableString(raw.historyPurgedAt ?? raw.history_purged_at),
    mediaPurgedAt: normalizeNullableString(raw.mediaPurgedAt ?? raw.media_purged_at),
    retentionLabel: normalizeNullableString(raw.retentionLabel ?? raw.retention_label),
    sourceType: normalizeNullableString(raw.sourceType) || normalizeNullableString(raw.source_type),
    sourceLabel: normalizeNullableString(raw.sourceLabel) || normalizeNullableString(raw.source_label),
    hasCommentContext:
      typeof raw.hasCommentContext === "boolean"
        ? raw.hasCommentContext
        : typeof raw.has_comment_context === "boolean"
          ? raw.has_comment_context
          : undefined,
    hasPrivateReply:
      typeof raw.hasPrivateReply === "boolean"
        ? raw.hasPrivateReply
        : typeof raw.has_private_reply === "boolean"
          ? raw.has_private_reply
          : undefined
  };
}

/**
 * Resolves Open inbox affordance for a Leads row (backward-compatible with legacy API rows).
 */
export function resolveLeadInboxActionState(lead: LeadPipelineRow): LeadInboxActionState {
  const href = buildDashboardConversationHref(lead.conversationId);
  const inboxState = lead.inboxState ?? "UNKNOWN";
  const hasExplicitCanOpen = lead.canOpenInbox !== undefined;

  let canOpen: boolean;
  if (lead.canOpenInbox === true) {
    canOpen = Boolean(href);
  } else if (lead.canOpenInbox === false) {
    canOpen = false;
  } else {
    canOpen = Boolean(href);
  }

  if (canOpen && href) {
    return { canOpen: true, href, statusLabel: null, statusClassName: "", helperText: null };
  }

  const retention = lead.retentionLabel?.trim() || null;
  const isPurged =
    inboxState === "PURGED" || Boolean(lead.historyPurgedAt?.trim()) || Boolean(lead.mediaPurgedAt?.trim());
  const isArchived = inboxState === "ARCHIVED" || Boolean(lead.conversationArchivedAt?.trim());

  if (isPurged) {
    return {
      canOpen: false,
      href: null,
      statusLabel: "History purged",
      statusClassName: "inbox-badge leads-inbox-state-badge leads-inbox-state-purged",
      helperText: retention ?? "Chat history is no longer available"
    };
  }

  if (isArchived) {
    return {
      canOpen: false,
      href: null,
      statusLabel: "Archived",
      statusClassName: "inbox-badge leads-inbox-state-badge leads-inbox-state-archived",
      helperText: retention ?? "No active inbox conversation"
    };
  }

  if (!href) {
    return {
      canOpen: false,
      href: null,
      statusLabel: null,
      statusClassName: "",
      helperText: hasExplicitCanOpen && lead.canOpenInbox === false ? "No active inbox conversation" : null
    };
  }

  return {
    canOpen: false,
    href: null,
    statusLabel: "Inbox unavailable",
    statusClassName: "inbox-badge leads-inbox-state-badge leads-inbox-state-unknown",
    helperText: retention ?? "Inbox is not available for this lead"
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
  const pageInfo = extractLeadsListPageInfo(body);
  return { ok: true, items, pageInfo };
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

export function resolveLeadRowSlaBadge(
  row: LeadPipelineRow,
  now = new Date(),
  options?: InboxBadgeSlaOptions
): LeadRowBadge | null {
  if (row.isSlaOverdue) {
    return { label: "SLA overdue", className: "inbox-badge inbox-badge-sla inbox-badge-sla-overdue" };
  }
  const at = row.slaDueAt ? parseIsoToDate(row.slaDueAt) : null;
  if (!at) return null;
  const dueSoonMs = resolveSlaDueSoonMsFromBadgeOptions(options);
  const bucket = computeSlaBucket(now, at, { dueSoonMs });
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

/** Visible loaded-count label for Leads table pagination feedback. */
export function formatLeadsLoadedCount(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return safe === 1 ? "Showing 1 lead" : `Showing ${safe} leads`;
}
