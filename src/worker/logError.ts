/**
 * Supabase PostgrestError and similar values are plain objects; String(e) is "[object Object]".
 */
export function loggableError(error: unknown): Record<string, unknown> | string {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 4000)
    };
  }
  if (error !== null && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of ["message", "code", "details", "hint", "status"] as const) {
      const v = e[key];
      if (v !== undefined && v !== null) out[key] = v;
    }
    if (Object.keys(out).length > 0) return out;
    try {
      return { serialized: JSON.stringify(error) };
    } catch {
      return "[unserializable error object]";
    }
  }
  return String(error);
}
