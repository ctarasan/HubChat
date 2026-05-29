const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export function parseLeadsListLimit(raw?: string): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

export const LeadsListPaginationConfig = {
  DEFAULT_LIMIT,
  MAX_LIMIT
} as const;
