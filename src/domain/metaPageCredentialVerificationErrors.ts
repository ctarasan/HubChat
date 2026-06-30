import type { ProviderVerificationDiagnostic } from "./metaPageCredentialProviderDiagnostics.js";

export type MetaPageCredentialVerificationErrorCode =
  | "META_TOKEN_INVALID"
  | "META_TOKEN_FAMILY_MISMATCH"
  | "META_APP_MISMATCH"
  | "META_PAGE_NOT_ACCESSIBLE"
  | "META_PAGE_IDENTITY_MISMATCH"
  | "META_IG_ACCOUNT_NOT_FOUND"
  | "META_IG_IDENTITY_MISMATCH"
  | "META_SCOPE_MISSING"
  | "META_TOKEN_EXPIRED"
  | "META_TOKEN_EXPIRY_TOO_NEAR"
  | "META_CONNECTION_NOT_FOUND"
  | "META_CONNECTION_TYPE_MISMATCH"
  | "META_PROVIDER_TIMEOUT"
  | "META_PROVIDER_UNAVAILABLE"
  | "META_PROVIDER_RESPONSE_INVALID"
  | "META_ACTIVATION_INPUT_INVALID"
  | "META_DEBUG_TOKEN_HTTP_REJECTED"
  | "META_DEBUG_TOKEN_NON_JSON_RESPONSE"
  | "META_DEBUG_TOKEN_EMPTY_RESPONSE"
  | "META_DEBUG_TOKEN_MISSING_DATA"
  | "META_DEBUG_TOKEN_NULL_DATA"
  | "META_DEBUG_TOKEN_ERROR_SHAPED_SUCCESS"
  | "META_DEBUG_TOKEN_UNEXPECTED_SHAPE"
  | "META_DEBUG_TOKEN_RESPONSE_TOO_LARGE"
  | "META_PAGE_IDENTITY_HTTP_REJECTED"
  | "META_PAGE_IDENTITY_NON_JSON_RESPONSE"
  | "META_PAGE_IDENTITY_EMPTY_RESPONSE"
  | "META_PAGE_IDENTITY_UNEXPECTED_SHAPE";

export class MetaPageCredentialVerificationError extends Error {
  override readonly name = "MetaPageCredentialVerificationError";

  constructor(
    readonly code: MetaPageCredentialVerificationErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly providerDiagnostic?: ProviderVerificationDiagnostic
  ) {
    super(message);
  }

  toPublicJson(): { code: MetaPageCredentialVerificationErrorCode; message: string; retryable: boolean } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable
    };
  }
}

export function isProviderDiagnosticSubcode(
  code: MetaPageCredentialVerificationErrorCode
): boolean {
  return code.startsWith("META_DEBUG_TOKEN_") || code.startsWith("META_PAGE_IDENTITY_");
}
