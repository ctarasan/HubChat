/**
 * Safe PostgREST `.or()` fragments for GET /api/leads search.
 * Embedded resource columns (e.g. `leads.name`) cannot appear inside `.or()` (PGRST100).
 */

/** Escape ILIKE metacharacters in the pattern body (between intentional * wildcards). */
export function escapePostgrestIlikePattern(term: string): string {
  return term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*");
}

/** Escape characters that break PostgREST filter string quoting. */
export function escapePostgrestFilterQuotedValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build `*term*` ilike operand for PostgREST. Uses `*` wildcards (alias for `%` in URL).
 * Value is double-quoted so commas/parens/quotes in user input do not break `.or()` parsing.
 */
export function buildPostgrestIlikeStarQuotedOperand(term: string): string {
  const pattern = `*${escapePostgrestIlikePattern(term)}*`;
  return `"${escapePostgrestFilterQuotedValue(pattern)}"`;
}

/**
 * Comma-separated `.or()` conditions on conversations table columns only.
 */
export function buildLeadsSearchOrFilter(term: string): string {
  const operand = buildPostgrestIlikeStarQuotedOperand(term);
  return [
    `participant_display_name.ilike.${operand}`,
    `provider_external_user_id.ilike.${operand}`,
    `channel_thread_id.ilike.${operand}`
  ].join(",");
}

export function buildLeadsMenuCursorOrFilter(cursor: { lastMessageAt: string; id: string }): string {
  return `last_message_at.lt."${escapePostgrestFilterQuotedValue(cursor.lastMessageAt)}",and(last_message_at.eq."${escapePostgrestFilterQuotedValue(cursor.lastMessageAt)}",id.lt."${escapePostgrestFilterQuotedValue(cursor.id)}")`;
}

/**
 * When both search and cursor pagination apply, combine with `and(...)` inside a single `.or()`
 * so PostgREST receives one `or` query param (multiple `.or()` calls overwrite each other).
 */
export function buildLeadsMenuSearchAndCursorOrFilter(
  searchTerm: string,
  cursor: { lastMessageAt: string; id: string }
): string {
  return `and(or(${buildLeadsSearchOrFilter(searchTerm)}),or(${buildLeadsMenuCursorOrFilter(cursor)}))`;
}
