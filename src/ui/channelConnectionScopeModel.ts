/**
 * CCW-1B — Channel connection scope UI model.
 * Consumes CCW-1A API fields only; does not classify or filter server-side data in UI.
 *
 * API (CCW-1A / #199):
 * - Query: connectionScope=active|all (default active)
 * - Conversation list: connection_label, connection_scope_bucket
 * - Leads list: connectionLabel, connectionScopeBucket
 * - pageInfo.connectionScope on list responses
 * - Workflow: connectionScope query; items lack connection label fields
 * - Analytics meta.connectionScopeApplied=false (not fully scoped)
 */

import type { DashboardRole } from "./teamInboxDashboardHelpers.js";

export const CONNECTION_SCOPE_QUERY_VALUES = ["active", "all"] as const;
export type ConnectionScopeQuery = (typeof CONNECTION_SCOPE_QUERY_VALUES)[number];

export const CONNECTION_SCOPE_BUCKET_VALUES = ["active", "historical", "unknown"] as const;
export type ConnectionScopeBucket = (typeof CONNECTION_SCOPE_BUCKET_VALUES)[number];

/** Row shape from CCW-1A list APIs (snake_case or camelCase). */
export type ConnectionScopeRowInput = {
  connection_label?: string | null;
  connectionLabel?: string | null;
  connection_scope_bucket?: string | null;
  connectionScopeBucket?: string | null;
  /** Must never be rendered — used only to reject accidental id-as-label passthrough. */
  provider_page_id?: string | null;
  providerPageId?: string | null;
};

export type ConnectionLabelDescriptor = {
  label: string;
  className: string;
  testId: string;
  bucket: ConnectionScopeBucket;
  showScopeBucketChip: boolean;
  scopeBucketChipLabel: string | null;
};

export type ConnectionScopeEmptyStateKind =
  | "active_no_conversations"
  | "active_no_leads"
  | "disconnected_hidden"
  | "all_scope_empty";

const UNKNOWN_CONNECTION_LABEL = "Unknown connection";

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function readConnectionScopeBucket(row: ConnectionScopeRowInput): ConnectionScopeBucket {
  const raw =
    normalizeString(row.connection_scope_bucket).toLowerCase() ||
    normalizeString(row.connectionScopeBucket).toLowerCase();
  if (raw === "active" || raw === "historical" || raw === "unknown") {
    return raw;
  }
  return "unknown";
}

/** Reject labels that equal provider page id or look like raw numeric provider ids. */
export function isUnsafeConnectionLabel(label: string, row: ConnectionScopeRowInput): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  const pageId =
    normalizeString(row.provider_page_id) || normalizeString(row.providerPageId);
  if (pageId && trimmed === pageId) return true;
  if (/^\d{8,}$/.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/Bearer\s+/i.test(trimmed)) return true;
  return false;
}

export function resolveConnectionLabel(row: ConnectionScopeRowInput): string {
  const raw = normalizeString(row.connection_label) || normalizeString(row.connectionLabel);
  if (!raw || isUnsafeConnectionLabel(raw, row)) {
    return UNKNOWN_CONNECTION_LABEL;
  }
  return raw;
}

export function connectionScopeBucketChipLabel(bucket: ConnectionScopeBucket): string | null {
  if (bucket === "historical") return "Historical";
  if (bucket === "unknown") return "Unknown";
  return null;
}

export function connectionScopeBucketChipClassName(bucket: ConnectionScopeBucket): string {
  return `channel-connection-scope-chip channel-connection-scope-chip-${bucket}`;
}

export function resolveConnectionLabelDescriptor(
  row: ConnectionScopeRowInput,
  options?: { includeDisconnectedChannels?: boolean; emphasizeScopeBucket?: boolean }
): ConnectionLabelDescriptor {
  const bucket = readConnectionScopeBucket(row);
  const label = resolveConnectionLabel(row);
  const showScopeBucketChip =
    bucket !== "active" &&
    (options?.includeDisconnectedChannels === true || options?.emphasizeScopeBucket === true);
  return {
    label,
    bucket,
    showScopeBucketChip,
    scopeBucketChipLabel: showScopeBucketChip ? connectionScopeBucketChipLabel(bucket) : null,
    className: `channel-connection-label channel-connection-label-${bucket}`,
    testId: `channel-connection-label-${bucket}`
  };
}

export function canShowIncludeDisconnectedToggle(role: DashboardRole | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function resolveEffectiveConnectionScope(
  role: DashboardRole | undefined,
  includeDisconnectedChannels: boolean
): ConnectionScopeQuery {
  if (!canShowIncludeDisconnectedToggle(role)) return "active";
  return includeDisconnectedChannels ? "all" : "active";
}

export function connectionScopeQueryParam(scope: ConnectionScopeQuery): string {
  if (scope === "all") return "&connectionScope=all";
  return "";
}

export function buildConnectionScopeQuerySuffix(
  role: DashboardRole | undefined,
  includeDisconnectedChannels: boolean
): string {
  return connectionScopeQueryParam(
    resolveEffectiveConnectionScope(role, includeDisconnectedChannels)
  );
}

export type ConnectionScopeEmptyState = {
  title: string;
  body: string;
  testId: string;
};

export function resolveConnectionScopeEmptyState(
  kind: ConnectionScopeEmptyStateKind,
  connectionLabel?: string | null
): ConnectionScopeEmptyState {
  const safeName = connectionLabel?.trim() || "this channel";
  switch (kind) {
    case "active_no_conversations":
      return {
        title: "No conversations yet",
        body: `No conversations for ${safeName}. Send a test message to verify inbound.`,
        testId: "connection-scope-empty-active-no-conversations"
      };
    case "active_no_leads":
      return {
        title: "No leads yet",
        body: `No leads from ${safeName} yet.`,
        testId: "connection-scope-empty-active-no-leads"
      };
    case "disconnected_hidden":
      return {
        title: "Historical channels hidden",
        body: "Enable Include disconnected channels to see previous Pages or LINE accounts.",
        testId: "connection-scope-empty-disconnected-hidden"
      };
    case "all_scope_empty":
      return {
        title: "No matching conversations",
        body: "Try adjusting filters or include disconnected channels.",
        testId: "connection-scope-empty-all-scope"
      };
  }
}

export type ConnectionDetailBanner = {
  visible: boolean;
  message: string;
  testId: string;
};

export function resolveConnectionDetailBanner(row: ConnectionScopeRowInput): ConnectionDetailBanner {
  const bucket = readConnectionScopeBucket(row);
  if (bucket === "historical") {
    return {
      visible: true,
      message: "This conversation is from a historical or disconnected channel connection.",
      testId: "connection-scope-banner-historical"
    };
  }
  if (bucket === "unknown") {
    return {
      visible: true,
      message: "Connection could not be matched to a known channel.",
      testId: "connection-scope-banner-unknown"
    };
  }
  return { visible: false, message: "", testId: "connection-scope-banner-none" };
}

export type WorkQueueConnectionScopeFallback = {
  mode: "api_fields" | "channel_type_only";
  helperText: string | null;
};

export const WORK_QUEUE_CONNECTION_SCOPE_PAGE_HINT =
  "Active connection scope filters work queue items after fetch; a page may show fewer rows until you load more.";

export const WORK_QUEUE_CONNECTION_LABEL_UNAVAILABLE_HINT =
  "Connection name is unavailable for work queue items. Channel type is shown instead.";

/** Workflow list items lack connection label fields in CCW-1A. */
export function resolveWorkQueueConnectionFallback(
  rowHasConnectionLabel: boolean
): WorkQueueConnectionScopeFallback {
  if (rowHasConnectionLabel) {
    return { mode: "api_fields", helperText: null };
  }
  return {
    mode: "channel_type_only",
    helperText: WORK_QUEUE_CONNECTION_LABEL_UNAVAILABLE_HINT
  };
}

export type AnalyticsConnectionScopeBanner = {
  visible: boolean;
  message: string;
  testId: string;
};

/** Analytics meta.connectionScopeApplied is false in CCW-1A — do not imply full scope. */
export function resolveAnalyticsConnectionScopeBanner(input: {
  connectionScopeApplied?: boolean;
  connectionScopeNote?: string | null;
}): AnalyticsConnectionScopeBanner {
  if (input.connectionScopeApplied === true) {
    return { visible: false, message: "", testId: "analytics-connection-scope-applied" };
  }
  const message =
    input.connectionScopeNote?.trim() ||
    "Analytics totals are tenant-wide. Use Team Inbox or Leads for active connection filtering.";
  return {
    visible: true,
    message,
    testId: "analytics-connection-scope-not-applied"
  };
}

export function readConnectionScopeFieldsFromRow(
  row: Record<string, unknown>
): ConnectionScopeRowInput {
  return {
    connection_label: normalizeString(row.connection_label) || null,
    connectionLabel: normalizeString(row.connectionLabel) || null,
    connection_scope_bucket: normalizeString(row.connection_scope_bucket) || null,
    connectionScopeBucket: normalizeString(row.connectionScopeBucket) || null,
    provider_page_id: normalizeString(row.provider_page_id) || null,
    providerPageId: normalizeString(row.providerPageId) || null
  };
}

export function readPageInfoConnectionScope(body: Record<string, unknown>): ConnectionScopeQuery | null {
  const pageInfo = body.pageInfo ?? body.page_info;
  if (!pageInfo || typeof pageInfo !== "object" || Array.isArray(pageInfo)) return null;
  const raw =
    normalizeString((pageInfo as Record<string, unknown>).connectionScope) ||
    normalizeString((pageInfo as Record<string, unknown>).connection_scope);
  if (raw === "active" || raw === "all") return raw;
  return null;
}
