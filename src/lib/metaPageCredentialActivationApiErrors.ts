import {
  MetaPageCredentialActivationError,
  safeActivationMessage
} from "../domain/metaPageCredentialActivationErrors.js";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialDecryptionFailedError } from "../domain/metaPageCredentialErrors.js";

export type MetaPageCredentialActivationApiErrorCode =
  | "META_ACTIVATION_DISABLED"
  | "META_ACTIVATION_UNAUTHORIZED"
  | "META_ACTIVATION_INPUT_INVALID"
  | "META_CONNECTION_NOT_FOUND"
  | "META_CONNECTION_TYPE_MISMATCH"
  | "META_TOKEN_INVALID"
  | "META_APP_MISMATCH"
  | "META_PAGE_IDENTITY_MISMATCH"
  | "META_IG_IDENTITY_MISMATCH"
  | "META_IG_ACCOUNT_NOT_FOUND"
  | "META_SCOPE_MISSING"
  | "META_TOKEN_EXPIRED"
  | "META_TOKEN_EXPIRY_TOO_NEAR"
  | "META_TOKEN_FAMILY_MISMATCH"
  | "META_PAGE_NOT_ACCESSIBLE"
  | "META_CREDENTIAL_VERSION_CONFLICT"
  | "META_ACTIVATION_CONFLICT"
  | "META_ACTIVATION_FAILED"
  | "META_POST_ACTIVATION_HEALTH_FAILED"
  | "META_PROVIDER_TIMEOUT"
  | "META_PROVIDER_UNAVAILABLE"
  | "META_PROVIDER_RESPONSE_INVALID";

const GENERIC_ACTIVATION_FAILURE_MESSAGE =
  "Activation failed. Contact engineering with the correlation reference.";

export class MetaPageCredentialActivationApiError extends Error {
  override readonly name = "MetaPageCredentialActivationApiError";

  constructor(
    readonly code: MetaPageCredentialActivationApiErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean
  ) {
    super(message);
  }

  toPublicJson(correlationId?: string): {
    code: MetaPageCredentialActivationApiErrorCode;
    message: string;
    error: string;
    retryable: boolean;
    correlationId?: string;
  } {
    const message = safeActivationPublicMessage(this.code);
    return {
      code: this.code,
      message,
      error: message,
      retryable: this.retryable,
      ...(correlationId ? { correlationId } : {})
    };
  }
}

export function safeActivationPublicMessage(code: MetaPageCredentialActivationApiErrorCode): string {
  switch (code) {
    case "META_ACTIVATION_DISABLED":
      return "Meta Page credential activation is not available";
    case "META_ACTIVATION_UNAUTHORIZED":
      return "Activation is available to Admins only";
    case "META_ACTIVATION_INPUT_INVALID":
      return "Activation request was invalid";
    case "META_CONNECTION_NOT_FOUND":
      return "Channel connection is not available for activation";
    case "META_CONNECTION_TYPE_MISMATCH":
      return "Channel connection type mismatch for activation";
    case "META_CREDENTIAL_VERSION_CONFLICT":
      return safeActivationMessage("META_CREDENTIAL_VERSION_CONFLICT");
    case "META_ACTIVATION_CONFLICT":
      return safeActivationMessage("META_ACTIVATION_CONFLICT");
    case "META_ACTIVATION_FAILED":
      return "Meta Page credential activation failed";
    case "META_POST_ACTIVATION_HEALTH_FAILED":
      return "Post-activation health verification failed";
    case "META_TOKEN_INVALID":
      return "Meta Page access token is invalid";
    case "META_APP_MISMATCH":
      return "Meta app binding does not match configuration";
    case "META_PAGE_IDENTITY_MISMATCH":
      return "Facebook Page identity does not match the connection";
    case "META_IG_IDENTITY_MISMATCH":
      return "Instagram account identity does not match the connection";
    case "META_IG_ACCOUNT_NOT_FOUND":
      return "Instagram Professional Account is not linked to the Page";
    case "META_SCOPE_MISSING":
      return "Required Meta scopes are missing";
    case "META_TOKEN_EXPIRED":
      return "Meta Page access token has expired";
    case "META_TOKEN_EXPIRY_TOO_NEAR":
      return "Meta Page access token expires too soon";
    case "META_TOKEN_FAMILY_MISMATCH":
      return "Token family is not valid for Meta Page activation";
    case "META_PAGE_NOT_ACCESSIBLE":
      return "Facebook Page is not accessible with the supplied token";
    case "META_PROVIDER_TIMEOUT":
      return "Meta provider request timed out";
    case "META_PROVIDER_UNAVAILABLE":
      return "Meta provider is temporarily unavailable";
    case "META_PROVIDER_RESPONSE_INVALID":
      return "Meta provider response was invalid";
    default:
      return GENERIC_ACTIVATION_FAILURE_MESSAGE;
  }
}

function withSafePublicMessage(error: MetaPageCredentialActivationApiError): MetaPageCredentialActivationApiError {
  const message = safeActivationPublicMessage(error.code);
  if (message === error.message) {
    return error;
  }
  return new MetaPageCredentialActivationApiError(error.code, message, error.httpStatus, error.retryable);
}

export function mapMetaPageCredentialActivationFailure(error: unknown): MetaPageCredentialActivationApiError {
  if (error instanceof MetaPageCredentialActivationApiError) {
    return withSafePublicMessage(error);
  }

  if (error instanceof MetaPageCredentialVerificationError) {
    return new MetaPageCredentialActivationApiError(
      verificationCodeToApiCode(error.code),
      safeVerificationMessage(error.code),
      verificationHttpStatus(error.code),
      error.retryable
    );
  }

  if (error instanceof MetaPageCredentialActivationError) {
    const apiCode = activationDomainCodeToApiCode(error.code);
    const httpStatus =
      error.code === "META_CREDENTIAL_VERSION_CONFLICT" || error.code === "META_ACTIVATION_CONFLICT"
        ? 409
        : error.code === "META_ACTIVATION_INPUT_INVALID" ||
            error.code === "META_CONNECTION_NOT_FOUND" ||
            error.code === "META_CONNECTION_TYPE_MISMATCH"
          ? 400
          : 503;
    return new MetaPageCredentialActivationApiError(
      apiCode,
      safeActivationPublicMessage(apiCode),
      httpStatus,
      error.retryable
    );
  }

  if (error instanceof ChannelCredentialEncryptionError) {
    return new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_FAILED",
      safeActivationPublicMessage("META_ACTIVATION_FAILED"),
      503,
      false
    );
  }

  if (error instanceof MetaPageCredentialDecryptionFailedError) {
    return new MetaPageCredentialActivationApiError(
      "META_POST_ACTIVATION_HEALTH_FAILED",
      safeActivationPublicMessage("META_POST_ACTIVATION_HEALTH_FAILED"),
      202,
      false
    );
  }

  if (error instanceof Error && error.message.includes("Unauthorized")) {
    return new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_UNAUTHORIZED",
      safeActivationPublicMessage("META_ACTIVATION_UNAUTHORIZED"),
      401,
      false
    );
  }

  if (error instanceof Error && error.message.includes("Forbidden")) {
    return new MetaPageCredentialActivationApiError(
      "META_ACTIVATION_UNAUTHORIZED",
      safeActivationPublicMessage("META_ACTIVATION_UNAUTHORIZED"),
      403,
      false
    );
  }

  return new MetaPageCredentialActivationApiError(
    "META_ACTIVATION_FAILED",
    GENERIC_ACTIVATION_FAILURE_MESSAGE,
    500,
    true
  );
}

function activationDomainCodeToApiCode(
  code: MetaPageCredentialActivationError["code"]
): MetaPageCredentialActivationApiErrorCode {
  return code;
}

function verificationCodeToApiCode(
  code: MetaPageCredentialVerificationError["code"]
): MetaPageCredentialActivationApiErrorCode {
  return code;
}

function verificationHttpStatus(code: MetaPageCredentialVerificationError["code"]): number {
  if (
    code === "META_TOKEN_INVALID" ||
    code === "META_APP_MISMATCH" ||
    code === "META_PAGE_IDENTITY_MISMATCH" ||
    code === "META_IG_IDENTITY_MISMATCH" ||
    code === "META_IG_ACCOUNT_NOT_FOUND" ||
    code === "META_SCOPE_MISSING" ||
    code === "META_TOKEN_EXPIRED" ||
    code === "META_TOKEN_EXPIRY_TOO_NEAR" ||
    code === "META_TOKEN_FAMILY_MISMATCH" ||
    code === "META_PAGE_NOT_ACCESSIBLE"
  ) {
    return 422;
  }
  if (
    code === "META_CONNECTION_NOT_FOUND" ||
    code === "META_CONNECTION_TYPE_MISMATCH" ||
    code === "META_ACTIVATION_INPUT_INVALID"
  ) {
    return 400;
  }
  if (code === "META_PROVIDER_TIMEOUT" || code === "META_PROVIDER_UNAVAILABLE") {
    return 503;
  }
  return 422;
}

function safeVerificationMessage(code: MetaPageCredentialVerificationError["code"]): string {
  return safeActivationPublicMessage(verificationCodeToApiCode(code));
}
