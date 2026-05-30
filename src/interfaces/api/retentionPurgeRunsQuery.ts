const DEFAULT_PURGE_RUNS_LIMIT = 20;
const MAX_PURGE_RUNS_LIMIT = 50;

export function parseRetentionPurgeRunsLimit(raw?: string): number {
  if (!raw) return DEFAULT_PURGE_RUNS_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PURGE_RUNS_LIMIT;
  return Math.min(MAX_PURGE_RUNS_LIMIT, Math.floor(n));
}
