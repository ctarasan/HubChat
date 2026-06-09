/**
 * CCW-1B prep — Channel connection scope UI model.
 * Consumes CCW-1A API fields only; does not classify or filter server-side data in UI.
 *
 * Proposed API (CCW-1A):
 * - Query: connectionScope=active|all (default active)
 * - Conversation list: connection_label, connection_status
 * - Leads list: connectionLabel, connectionStatus
 * - Workflow: TBD — use channel-type fallback until API adds fields
 */

import type { DashboardRole } from "./teamInboxDashboardHelpers.js";

export const CONNECTION_SCOPE_QUERY_VALUES = ["active", "all"] as const;
export type ConnectionScopeQuery = (typeof CONNECTION_SCOPE_QUERY_VALUES)[number];

export const CONNECTION_STATUS_VALUES = ["active", "disconnected", "unknown"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUS_VALUES)[number];

/** Row shape from CCW-1A list APIs (snake_case or camelCase). */
export type ConnectionScopeRowInput = {
  connection_label?: string | null;
  connectionLabel?: string | null;
  connection_status?: string | null;
  connectionStatus?: string | null;
  /** Must never be rendered — used only to reject accidental id-as-label passthrough. */
  provider_page_id?: string | null;
  providerPageId?: string | null;
};

export type ConnectionLabelDescriptor = {
  label: string;
  className: string;
  testId: string;
  status: ConnectionStatus;
  showDisconnectedChip: boolean;
};

export type ConnectionScopeEmptyStateKind =
  | "active_no_conversations"
  | "active_no_leads"
  | "disconnected_hidden"
  | "all_scope_empty";

const UNKNOWN_CONNECTION_LABEL = "Unknown connection";
const DISCONNECTED_CHIP_LABEL = "Disconnected";

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function readConnectionStatus(row: ConnectionScopeRowInput): ConnectionStatus {
  const raw =
    normalizeString(row.connection_status).toLowerCase() ||
    normalizeString(row.connectionStatus).toLowerCase();
  if (raw === "active" || raw === "disconnected" || raw === "unknown") {
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

export function resolveConnectionLabelDescriptor(
  row: ConnectionScopeRowInput,
  options?: { includeDisconnectedChannels?: boolean }
): ConnectionLabelDescriptor {
  const status = readConnectionStatus(row);
  const label = resolveConnectionLabel(row);
  const includeDisconnected = options?.includeDisconnectedChannels === true;
  const showDisconnectedChip = includeDisconnected && status === "disconnected";
  return {
    label,
    status,
    showDisconnectedChip,
    className: `channel-connection-label channel-connection-label-${status}`,
    testId: `channel-connection-label-${status}`
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
        title: "Disconnected channels hidden",
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

export type WorkQueueConnectionScopeFallback = {
  mode: "api_fields" | "channel_type_only";
  helperText: string | null;
};

/** Workflow API lacks connection fields until CCW-1A extends it. */
export function resolveWorkQueueConnectionFallback(
  rowHasConnectionLabel: boolean
): WorkQueueConnectionScopeFallback {
  if (rowHasConnectionLabel) {
    return { mode: "api_fields", helperText: null };
  }
  return {
    mode: "channel_type_only",
    helperText: "Connection name unavailable for work queue items until Workflow API adds scope fields."
  };
}

export type AnalyticsConnectionScopeBanner = {
  visible: boolean;
  message: string;
  testId: string;
};

export function resolveAnalyticsConnectionScopeBanner(input: {
  apiSupportsConnectionScope: boolean;
  includeDisconnectedChannels: boolean;
  hasDisconnectedHistory: boolean;
}): AnalyticsConnectionScopeBanner {
  if (!input.apiSupportsConnectionScope) {
    return {
      visible: true,
      message: "Analytics totals include all tenant history until connection scope is enabled.",
      testId: "analytics-connection-scope-unsupported"
    };
  }
  if (!input.includeDisconnectedChannels && input.hasDisconnectedHistory) {
    return {
      visible: true,
      message: "Totals reflect active connections only. Enable Include disconnected channels for full history.",
      testId: "analytics-connection-scope-active-only"
    };
  }
  return { visible: false, message: "", testId: "analytics-connection-scope-none" };
}

export function readConnectionScopeFieldsFromRow(
  row: Record<string, unknown>
): ConnectionScopeRowInput {
  return {
    connection_label: normalizeString(row.connection_label) || null,
    connectionLabel: normalizeString(row.connectionLabel) || null,
    connection_status: normalizeString(row.connection_status) || null,
    connectionStatus: normalizeString(row.connectionStatus) || null,
    provider_page_id: normalizeString(row.provider_page_id) || null,
    providerPageId: normalizeString(row.providerPageId) || null
  };
}

export function disconnectedChannelChipClassName(): string {
  return "channel-connection-disconnected-chip";
}

export function disconnectedChannelChipLabel(): string {
  return DISCONNECTED_CHIP_LABEL;
}
