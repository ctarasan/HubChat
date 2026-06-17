/**
 * Produces a JSON-log-safe snapshot of any thrown value (Supabase PostgrestError,
 * AggregateError, plain objects, primitives). Avoid logging unknown values with
 * the `err` key (pino serializers) or `String(x)` on objects — both can surface as "[object Object]".
 */
export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: string | number;
  cause?: SerializedError | string;
  /** Full JSON snapshot when useful (non-Error objects, extra fields) */
  rawJson?: string;
};

const MAX_STACK = 8000;
const MAX_CAUSE_DEPTH = 5;
const MAX_RAW_JSON = 12000;

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    });
  } catch {
    return undefined;
  }
}

function asPostgrestLike(obj: Record<string, unknown>): Partial<Pick<SerializedError, "code" | "details" | "hint" | "status">> {
  const out: Partial<SerializedError> = {};
  for (const key of ["code", "details", "hint", "status"] as const) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = v as never;
    } else {
      const s = safeJsonStringify(v);
      if (s !== undefined) (out as Record<string, string>)[key] = s;
      else (out as Record<string, string>)[key] = String(v);
    }
  }
  return out;
}

function serializeCause(cause: unknown, depth: number): SerializedError | string | undefined {
  if (depth > MAX_CAUSE_DEPTH) return "[max cause depth]";
  if (cause === undefined || cause === null) return undefined;
  return serializeErrorInternal(cause, depth + 1);
}

function serializeErrorInternal(error: unknown, depth: number): SerializedError {
  if (error instanceof Error) {
    const base: SerializedError = {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, MAX_STACK)
    };
    const diagnosticCode =
      "diagnosticCode" in error && typeof (error as { diagnosticCode?: unknown }).diagnosticCode === "string"
        ? (error as { diagnosticCode: string }).diagnosticCode
        : undefined;
    if (diagnosticCode) {
      base.code = diagnosticCode;
    }
    const pg = asPostgrestLike(error as unknown as Record<string, unknown>);
    Object.assign(base, pg);
    const c = "cause" in error ? (error as { cause?: unknown }).cause : undefined;
    if (c !== undefined) {
      const sc = serializeCause(c, depth);
      if (sc !== undefined) base.cause = sc;
    }
    return base;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "number" || typeof error === "boolean") {
    return { message: String(error) };
  }

  if (error === null || typeof error !== "object") {
    return { message: String(error) };
  }

  const obj = error as Record<string, unknown>;
  const msg =
    typeof obj.message === "string"
      ? obj.message
      : typeof obj.error_description === "string"
        ? obj.error_description
        : typeof obj.msg === "string"
          ? obj.msg
          : undefined;

  const merged: SerializedError = {
    ...asPostgrestLike(obj),
    message: msg ?? "[non-Error object]",
    name: typeof obj.name === "string" ? obj.name : undefined
  };

  if (typeof obj.stack === "string") merged.stack = obj.stack.slice(0, MAX_STACK);

  const c = obj.cause;
  if (c !== undefined) {
    const sc = serializeCause(c, depth);
    if (sc !== undefined) merged.cause = sc;
  }

  const raw = safeJsonStringify(error);
  if (raw !== undefined) {
    merged.rawJson = raw.length > MAX_RAW_JSON ? `${raw.slice(0, MAX_RAW_JSON)}…` : raw;
    if (!msg) merged.message = raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw;
  } else if (!msg) {
    merged.message = "[unserializable object]";
  }

  return merged;
}

export function serializeError(error: unknown): SerializedError {
  return serializeErrorInternal(error, 0);
}
