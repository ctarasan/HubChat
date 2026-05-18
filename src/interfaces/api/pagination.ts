const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MESSAGE_DEFAULT_LIMIT = 30;
const MESSAGE_MAX_LIMIT = 100;

export function parseLimit(raw?: string): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

export function parseMessageLimit(raw?: string): number {
  if (!raw) return MESSAGE_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return MESSAGE_DEFAULT_LIMIT;
  return Math.min(MESSAGE_MAX_LIMIT, Math.floor(n));
}

export function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T extends Record<string, unknown>>(cursor?: string): T | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export const PaginationConfig = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MESSAGE_DEFAULT_LIMIT,
  MESSAGE_MAX_LIMIT
} as const;
