/** Sanitized Instagram OAuth connect error taxonomy — IG-AUTH-2C. */

export type InstagramOAuthConnectErrorCode =
  | "INSTAGRAM_OAUTH_DISABLED"
  | "INSTAGRAM_OAUTH_CONNECTION_NOT_FOUND"
  | "INSTAGRAM_OAUTH_CONNECTION_PROVIDER_MISMATCH"
  | "INSTAGRAM_OAUTH_ALREADY_CONNECTED"
  | "INSTAGRAM_OAUTH_STATE_INVALID"
  | "INSTAGRAM_OAUTH_STATE_EXPIRED"
  | "INSTAGRAM_OAUTH_STATE_REPLAYED"
  | "INSTAGRAM_OAUTH_ACCESS_DENIED"
  | "INSTAGRAM_OAUTH_CALLBACK_INVALID"
  | "INSTAGRAM_OAUTH_EXCHANGE_FAILED"
  | "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE"
  | "INSTAGRAM_OAUTH_RESPONSE_INVALID"
  | "INSTAGRAM_OAUTH_CREDENTIAL_CONFLICT"
  | "INSTAGRAM_OAUTH_PERSISTENCE_FAILED";

export class InstagramOAuthConnectError extends Error {
  override readonly name = "InstagramOAuthConnectError";

  constructor(
    readonly code: InstagramOAuthConnectErrorCode,
    message: string,
    readonly httpStatus: number = 400,
    readonly restartRequired = false
  ) {
    super(message);
  }
}

export function mapInstagramOAuthConnectErrorToHttpStatus(code: InstagramOAuthConnectErrorCode): number {
  switch (code) {
    case "INSTAGRAM_OAUTH_DISABLED":
      return 503;
    case "INSTAGRAM_OAUTH_CONNECTION_NOT_FOUND":
      return 404;
    case "INSTAGRAM_OAUTH_ALREADY_CONNECTED":
      return 409;
    case "INSTAGRAM_OAUTH_STATE_INVALID":
    case "INSTAGRAM_OAUTH_STATE_EXPIRED":
    case "INSTAGRAM_OAUTH_STATE_REPLAYED":
    case "INSTAGRAM_OAUTH_CALLBACK_INVALID":
    case "INSTAGRAM_OAUTH_ACCESS_DENIED":
      return 400;
    case "INSTAGRAM_OAUTH_PROVIDER_UNAVAILABLE":
      return 502;
    default:
      return 400;
  }
}

export function mapProviderCallbackErrorToCode(input: {
  error?: string | null;
  error_reason?: string | null;
}): InstagramOAuthConnectErrorCode {
  const reason = `${input.error ?? ""} ${input.error_reason ?? ""}`.toLowerCase();
  if (reason.includes("access_denied") || reason.includes("denied")) {
    return "INSTAGRAM_OAUTH_ACCESS_DENIED";
  }
  return "INSTAGRAM_OAUTH_CALLBACK_INVALID";
}
