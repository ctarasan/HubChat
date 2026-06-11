const LINE_EVENT_ONLY_INBOX_PREVIEWS = new Set(["[event]", "[Empty]"]);

function readChannelType(row: Record<string, unknown>): string {
  const raw = row.channel_type ?? row.channelType;
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function readLastMessagePreview(row: Record<string, unknown>): string | null {
  const raw = row.last_message_preview ?? row.lastMessagePreview;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when a LINE conversation row should be hidden from inbox list queries. */
export function isLineEventOnlyInboxRow(row: Record<string, unknown>): boolean {
  if (readChannelType(row) !== "LINE") return false;
  const preview = readLastMessagePreview(row);
  if (preview == null) return true;
  return LINE_EVENT_ONLY_INBOX_PREVIEWS.has(preview);
}

/**
 * PostgREST `.or()` filter: keep non-LINE rows and LINE rows whose preview is a real customer message.
 */
export function buildLineEventOnlyInboxExclusionOrFilter(): string {
  return [
    "channel_type.neq.LINE",
    "and(channel_type.eq.LINE,last_message_preview.not.is.null,last_message_preview.neq.[event],last_message_preview.neq.[Empty])"
  ].join(",");
}

export function filterLineEventOnlyInboxRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.filter((row) => !isLineEventOnlyInboxRow(row));
}
