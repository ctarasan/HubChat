import { serializeError, type SerializedError } from "./serializeError.js";

/** Client-safe API error detail (no secret fields, no rawJson). */
export type ClientErrorDetail = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: string | number;
};

export function toClientErrorDetail(error: unknown): ClientErrorDetail {
  const s = serializeError(error);
  const detail: ClientErrorDetail = { message: s.message };
  if (s.code !== undefined) detail.code = String(s.code);
  if (s.details !== undefined) detail.details = String(s.details);
  if (s.hint !== undefined) detail.hint = String(s.hint);
  if (s.status !== undefined) detail.status = s.status;
  return detail;
}

/**
 * PostgREST errors from @supabase/supabase-js are plain objects; String(error) is "[object Object]".
 * Re-throw as Error with readable message and attach safe metadata for logging/handlers.
 */
export function throwIfSupabaseError(error: unknown): void {
  if (!error) return;
  const s = serializeError(error);
  const err = new Error(s.message) as Error & Partial<Pick<SerializedError, "code" | "details" | "hint" | "status">>;
  if (s.code !== undefined) err.code = s.code;
  if (s.details !== undefined) err.details = s.details;
  if (s.hint !== undefined) err.hint = s.hint;
  if (s.status !== undefined) err.status = s.status;
  throw err;
}
