/**
 * Escape `%`, `_`, and `\` for PostgREST `.ilike()` when matching a whole email
 * (no wildcards) so lookup is case-insensitive and safe for special characters.
 */
export function emailForExactIlike(raw: string): string {
  return raw.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Trim + lowercase for `sales_agents.email` storage and duplicate checks. */
export function normalizeEmailForStorage(raw: string): string {
  return raw.trim().toLowerCase();
}
