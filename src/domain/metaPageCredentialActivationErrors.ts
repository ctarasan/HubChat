export type MetaPageCredentialActivationErrorCode =
  | "META_ACTIVATION_CONFLICT"
  | "META_CREDENTIAL_VERSION_CONFLICT"
  | "META_ACTIVATION_INPUT_INVALID"
  | "META_CONNECTION_NOT_FOUND"
  | "META_CONNECTION_TYPE_MISMATCH"
  | "META_PROVIDER_UNAVAILABLE";

export class MetaPageCredentialActivationError extends Error {
  override readonly name = "MetaPageCredentialActivationError";

  constructor(
    readonly code: MetaPageCredentialActivationErrorCode,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }

  toPublicJson(): { code: MetaPageCredentialActivationErrorCode; message: string; retryable: boolean } {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable
    };
  }
}

const ACTIVATION_ERROR_CODES: MetaPageCredentialActivationErrorCode[] = [
  "META_ACTIVATION_CONFLICT",
  "META_CREDENTIAL_VERSION_CONFLICT",
  "META_ACTIVATION_INPUT_INVALID",
  "META_CONNECTION_NOT_FOUND",
  "META_CONNECTION_TYPE_MISMATCH",
  "META_PROVIDER_UNAVAILABLE"
];

export function mapRpcMessageToMetaPageCredentialActivationError(
  message: string
): MetaPageCredentialActivationError | null {
  const trimmed = message.trim();
  for (const code of ACTIVATION_ERROR_CODES) {
    if (trimmed === code || trimmed.includes(code)) {
      const retryable = code === "META_PROVIDER_UNAVAILABLE";
      return new MetaPageCredentialActivationError(code, safeActivationMessage(code), retryable);
    }
  }
  return null;
}

function safeActivationMessage(code: MetaPageCredentialActivationErrorCode): string {
  switch (code) {
    case "META_ACTIVATION_CONFLICT":
      return "Meta Page credential activation conflict";
    case "META_CREDENTIAL_VERSION_CONFLICT":
      return "Meta Page credential version conflict";
    case "META_ACTIVATION_INPUT_INVALID":
      return "Meta Page credential activation input is invalid";
    case "META_CONNECTION_NOT_FOUND":
      return "Channel connection is not available for activation";
    case "META_CONNECTION_TYPE_MISMATCH":
      return "Channel connection type mismatch for activation";
    default:
      return "Meta Page credential activation is temporarily unavailable";
  }
}
