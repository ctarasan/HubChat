import { serializeError, type SerializedError } from "../lib/serializeError.js";

export { serializeError, type SerializedError };

/** @deprecated Prefer `serializeError` — log as `{ error: serializeError(e) }` not `err` (pino `err` serializers). */
export function loggableError(error: unknown): SerializedError {
  return serializeError(error);
}
