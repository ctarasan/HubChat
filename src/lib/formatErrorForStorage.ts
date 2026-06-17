import { serializeError } from "./serializeError.js";

const MAX_STORED_ERROR_LENGTH = 12000;

function readDiagnosticCode(error: unknown): string | undefined {
  if (error instanceof Error && "diagnosticCode" in error) {
    const code = (error as { diagnosticCode?: unknown }).diagnosticCode;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return serializeError(error).code;
}

/** Bounded text for queue_jobs.last_error and similar persistence (no secrets). */
export function formatErrorForStorage(error: unknown): string {
  if (error instanceof Error) {
    const diagnosticCode = readDiagnosticCode(error);
    const base = error.stack ?? `${error.name}: ${error.message}`;
    const suffix = diagnosticCode ? `\ndiagnosticCode=${diagnosticCode}` : "";
    const text = `${base}${suffix}`;
    return text.length > MAX_STORED_ERROR_LENGTH ? `${text.slice(0, MAX_STORED_ERROR_LENGTH)}…` : text;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
