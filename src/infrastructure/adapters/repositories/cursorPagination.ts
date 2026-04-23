export function encodeRepoCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeRepoCursor<T extends Record<string, unknown>>(cursor?: string): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
