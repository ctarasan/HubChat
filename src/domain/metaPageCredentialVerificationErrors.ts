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
  | "META_ACTIVATION_INPUT_INVALID";

export class MetaPageCredentialVerificationError extends Error {
  override readonly name = "MetaPageCredentialVerificationError";

  constructor(
    readonly code: MetaPageCredentialVerificationErrorCode,
    message: string,
    readonly retryable: boolean
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
