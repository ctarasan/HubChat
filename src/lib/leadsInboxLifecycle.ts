export type LeadsInboxState = "ACTIVE" | "ARCHIVED" | "PURGED" | "UNKNOWN";

export type LeadsInboxLifecycleFields = {
  inboxState: LeadsInboxState;
  canOpenInbox: boolean;
  canReopenInbox: boolean;
  conversationArchivedAt: string | null;
  historyPurgedAt: string | null;
  mediaPurgedAt: string | null;
  retentionLabel: string | null;
};

const ACTIVE_CONVERSATION_STATUSES = new Set(["OPEN", "PENDING", "RESOLVED"]);

function pickIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickIsoFromRow(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const iso = pickIso(row[key]);
    if (iso) return iso;
  }
  return null;
}

function normalizeConversationStatus(row: Record<string, unknown>): string {
  const raw = row.status ?? row.conversation_status ?? row.conversationStatus;
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase();
}

/**
 * Maps conversation row fields to Leads menu inbox lifecycle contract.
 * Does not perform purge/delete; read-only interpretation of stored state.
 */
export function resolveLeadsInboxLifecycle(row: Record<string, unknown>): LeadsInboxLifecycleFields {
  const historyPurgedAt = pickIsoFromRow(row, "history_purged_at", "historyPurgedAt");
  const mediaPurgedAt = pickIsoFromRow(row, "media_purged_at", "mediaPurgedAt");
  const status = normalizeConversationStatus(row);

  if (historyPurgedAt || mediaPurgedAt) {
    return {
      inboxState: "PURGED",
      canOpenInbox: false,
      canReopenInbox: false,
      conversationArchivedAt: null,
      historyPurgedAt,
      mediaPurgedAt,
      retentionLabel: "History unavailable"
    };
  }

  if (status === "ARCHIVED") {
    const conversationArchivedAt =
      pickIsoFromRow(row, "resolved_at", "resolvedAt") ??
      pickIsoFromRow(row, "closed_at", "closedAt") ??
      pickIsoFromRow(row, "updated_at", "updatedAt");
    return {
      inboxState: "ARCHIVED",
      canOpenInbox: false,
      canReopenInbox: true,
      conversationArchivedAt,
      historyPurgedAt: null,
      mediaPurgedAt: null,
      retentionLabel: "Archived"
    };
  }

  if (ACTIVE_CONVERSATION_STATUSES.has(status)) {
    return {
      inboxState: "ACTIVE",
      canOpenInbox: true,
      canReopenInbox: false,
      conversationArchivedAt: null,
      historyPurgedAt: null,
      mediaPurgedAt: null,
      retentionLabel: null
    };
  }

  return {
    inboxState: "UNKNOWN",
    canOpenInbox: false,
    canReopenInbox: false,
    conversationArchivedAt: null,
    historyPurgedAt: null,
    mediaPurgedAt: null,
    retentionLabel: status === "CLOSED" ? "Closed (legacy)" : null
  };
}
