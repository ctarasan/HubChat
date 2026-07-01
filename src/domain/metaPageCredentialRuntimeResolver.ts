import { sanitizeProviderErrorMessage } from "../lib/sanitizeProviderError.js";

export type MetaPageCredentialRuntimeDiagnosticCode =
  | "ambiguous_binding"
  | "binding_channel_mismatch"
  | "binding_inactive"
  | "credential_state_invalid"
  | "credential_decrypt_failed"
  | "credential_not_found";

export class MetaPageCredentialRuntimeResolverError extends Error {
  override readonly name = "MetaPageCredentialRuntimeResolverError";

  constructor(
    message: string,
    readonly diagnosticCode: MetaPageCredentialRuntimeDiagnosticCode,
    /** When true, Facebook outbound must not fall back to Channel Connect or ENV credentials. */
    readonly blockLegacyFallback = true
  ) {
    super(sanitizeProviderErrorMessage(message));
  }
}
