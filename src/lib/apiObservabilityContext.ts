import type { ApiListDiagnosticFields } from "../domain/observability.js";

/**
 * Build safe structured fields for HUBCHAT_DIAGNOSTIC_LOGS.
 * Never includes message content, auth tokens, or provider secrets.
 */
export function buildApiListDiagnostic(fields: ApiListDiagnosticFields): Record<string, unknown> {
  return {
    diag: fields.route,
    tenantId: fields.tenantId,
    limit: fields.limit,
    hasCursor: fields.hasCursor,
    rawRowCount: fields.rawRowCount,
    responseRowCount: fields.responseRowCount,
    ...(fields.estimatedUtf8Bytes !== undefined ? { estimatedUtf8Bytes: fields.estimatedUtf8Bytes } : {}),
    ...(fields.payloadTier !== undefined ? { payloadTier: fields.payloadTier } : {}),
    ...(fields.filters ? { filters: fields.filters } : {})
  };
}
