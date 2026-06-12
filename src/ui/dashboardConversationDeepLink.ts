/**
 * PL-NAV-1 — Pipeline "Open inbox" deep-link helpers for the Dashboard Inbox.
 *
 * The Pipeline (Leads) page links to `/dashboard?conversationId=<uuid>`.
 * These helpers parse/validate that target, merge an out-of-page conversation
 * row into the loaded list, and clean the URL after the target is applied.
 */

export const DASHBOARD_CONVERSATION_DEEP_LINK_PARAM = "conversationId";

const CONVERSATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/**
 * Reads and validates the `conversationId` query parameter.
 * Returns null for missing, empty, or malformed values (never throws).
 */
export function readDashboardConversationDeepLink(search: string | null | undefined): string | null {
  if (typeof search !== "string" || !search.trim()) return null;
  let raw: string | null = null;
  try {
    raw = toSearchParams(search).get(DASHBOARD_CONVERSATION_DEEP_LINK_PARAM);
  } catch {
    return null;
  }
  const id = typeof raw === "string" ? raw.trim() : "";
  return CONVERSATION_UUID_RE.test(id) ? id : null;
}

/**
 * Returns the same URL with the deep-link parameter removed (other params kept).
 * Used with history.replaceState so Back still returns to the Pipeline page.
 */
export function stripDashboardConversationDeepLink(pathname: string, search: string): string {
  let params: URLSearchParams;
  try {
    params = toSearchParams(search ?? "");
  } catch {
    return pathname;
  }
  params.delete(DASHBOARD_CONVERSATION_DEEP_LINK_PARAM);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/**
 * Appends a deep-link conversation row when it is not already part of the page rows.
 * Never reorders or replaces existing rows.
 */
export function mergeConversationRowsWithDeepLinkRow<T extends { id: string }>(
  pageRows: T[],
  deepLinkRow: T | null | undefined
): T[] {
  if (!deepLinkRow) return pageRows;
  if (pageRows.some((row) => row.id === deepLinkRow.id)) return pageRows;
  return [...pageRows, deepLinkRow];
}
