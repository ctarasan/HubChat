import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialDecryptionFailedError } from "../domain/metaPageCredentialErrors.js";
import type { MetaPageCredentialActivationApiError } from "./metaPageCredentialActivationApiErrors.js";

export type MetaPageCredentialActivationStage =
  | "ROUTE_VALIDATION"
  | "AUTHORIZATION"
  | "TARGET_VALIDATION"
  | "PROVIDER_VERIFICATION"
  | "ENCRYPTION_PRECHECK"
  | "ACTIVATION_RPC"
  | "POST_COMMIT_HEALTH"
  | "UNKNOWN";

export type MetaPageCredentialActivationFailureLogEvent = {
  eventType: "META_PAGE_CREDENTIAL_ACTIVATION_FAILURE";
  correlationId: string;
  stage: MetaPageCredentialActivationStage;
  sanitizedCode: string;
  httpStatus: number;
  tenantRef: string | null;
  connectionRef: string | null;
  requestedChannels: string[] | null;
  expectedCredentialVersion: number | null;
  commitReached: boolean;
  timestamp: string;
};

export type MetaPageCredentialActivationRequestContext = {
  tenantId?: string;
  facebookConnectionId?: string;
  requestedChannels?: string[];
  expectedCredentialVersion?: number;
};

export type MetaPageCredentialActivationPublicErrorJson = {
  code: string;
  message: string;
  error: string;
  retryable: boolean;
  correlationId: string;
};

const PROVIDER_VERIFICATION_CODES = new Set([
  "META_TOKEN_INVALID",
  "META_APP_MISMATCH",
  "META_PAGE_IDENTITY_MISMATCH",
  "META_IG_IDENTITY_MISMATCH",
  "META_IG_ACCOUNT_NOT_FOUND",
  "META_SCOPE_MISSING",
  "META_TOKEN_EXPIRED",
  "META_TOKEN_EXPIRY_TOO_NEAR",
  "META_TOKEN_FAMILY_MISMATCH",
  "META_PAGE_NOT_ACCESSIBLE",
  "META_PROVIDER_TIMEOUT",
  "META_PROVIDER_UNAVAILABLE",
  "META_PROVIDER_RESPONSE_INVALID"
]);

const FORBIDDEN_LOG_SUBSTRINGS = [
  "accessToken",
  "access_token",
  "Authorization",
  "Bearer ",
  "ciphertext",
  "encrypted",
  "tokenFingerprint",
  "appSecret",
  "encryptionKey",
  "EAA"
] as const;

export function sanitizeActivationRef(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function createActivationCorrelationId(
  randomUuid: () => string = () => globalThis.crypto.randomUUID()
): string {
  const id = randomUuid().trim();
  if (!id) {
    throw new Error("Activation correlation id generation failed");
  }
  return id;
}

export function isActivationCommitReached(stage: MetaPageCredentialActivationStage): boolean {
  return stage === "ACTIVATION_RPC" || stage === "POST_COMMIT_HEALTH";
}

export function inferMetaPageCredentialActivationStage(
  error: unknown,
  mapped: Pick<MetaPageCredentialActivationApiError, "code" | "message" | "httpStatus">
): MetaPageCredentialActivationStage {
  if (error instanceof MetaPageCredentialVerificationError) {
    return "PROVIDER_VERIFICATION";
  }
  if (error instanceof ChannelCredentialEncryptionError) {
    return "ENCRYPTION_PRECHECK";
  }
  if (error instanceof MetaPageCredentialDecryptionFailedError) {
    return "POST_COMMIT_HEALTH";
  }
  if (error instanceof MetaPageCredentialActivationError) {
    if (
      error.code === "META_CONNECTION_NOT_FOUND" ||
      error.code === "META_CONNECTION_TYPE_MISMATCH" ||
      error.code === "META_ACTIVATION_INPUT_INVALID"
    ) {
      return error.code === "META_ACTIVATION_INPUT_INVALID" ? "ROUTE_VALIDATION" : "TARGET_VALIDATION";
    }
    return "ACTIVATION_RPC";
  }
  if (error instanceof Error) {
    if (error.message.includes("Unauthorized")) return "AUTHORIZATION";
    if (error.message.includes("Forbidden")) return "AUTHORIZATION";
  }

  switch (mapped.code) {
    case "META_ACTIVATION_DISABLED":
    case "META_ACTIVATION_INPUT_INVALID":
      return "ROUTE_VALIDATION";
    case "META_ACTIVATION_UNAUTHORIZED":
      return "AUTHORIZATION";
    case "META_CONNECTION_NOT_FOUND":
    case "META_CONNECTION_TYPE_MISMATCH":
      return "TARGET_VALIDATION";
    case "META_POST_ACTIVATION_HEALTH_FAILED":
      return "POST_COMMIT_HEALTH";
    case "META_ACTIVATION_CONFLICT":
    case "META_CREDENTIAL_VERSION_CONFLICT":
    case "META_ACTIVATION_FAILED":
      if (mapped.message.toLowerCase().includes("encryption")) {
        return "ENCRYPTION_PRECHECK";
      }
      return "ACTIVATION_RPC";
    default:
      break;
  }

  if (PROVIDER_VERIFICATION_CODES.has(mapped.code)) {
    return "PROVIDER_VERIFICATION";
  }

  return "UNKNOWN";
}

export function buildMetaPageCredentialActivationFailureLogEvent(input: {
  correlationId: string;
  stage: MetaPageCredentialActivationStage;
  sanitizedCode: string;
  httpStatus: number;
  context: MetaPageCredentialActivationRequestContext;
  timestamp?: string;
}): MetaPageCredentialActivationFailureLogEvent {
  const event: MetaPageCredentialActivationFailureLogEvent = {
    eventType: "META_PAGE_CREDENTIAL_ACTIVATION_FAILURE",
    correlationId: input.correlationId,
    stage: input.stage,
    sanitizedCode: input.sanitizedCode,
    httpStatus: input.httpStatus,
    tenantRef: sanitizeActivationRef(input.context.tenantId),
    connectionRef: sanitizeActivationRef(input.context.facebookConnectionId),
    requestedChannels: input.context.requestedChannels ?? null,
    expectedCredentialVersion: input.context.expectedCredentialVersion ?? null,
    commitReached: isActivationCommitReached(input.stage),
    timestamp: input.timestamp ?? new Date().toISOString()
  };
  assertMetaPageCredentialActivationFailureLogSafe(event);
  return event;
}

export function assertMetaPageCredentialActivationFailureLogSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const needle of FORBIDDEN_LOG_SUBSTRINGS) {
    if (json.includes(needle)) {
      throw new Error(`Activation failure log must not include ${needle}`);
    }
  }
}

export type MetaPageCredentialActivationFailureLogger = {
  warn: (payload: MetaPageCredentialActivationFailureLogEvent, message: string) => void;
};

export function logMetaPageCredentialActivationFailure(
  logger: MetaPageCredentialActivationFailureLogger,
  event: MetaPageCredentialActivationFailureLogEvent
): void {
  logger.warn(event, "meta_page_credential_activation_failure");
}

export function buildPublicActivationErrorJson(
  mapped: Pick<MetaPageCredentialActivationApiError, "code" | "message" | "retryable" | "httpStatus">,
  correlationId: string
): MetaPageCredentialActivationPublicErrorJson {
  const message = mapped.message.trim() || "Meta Page credential activation failed";
  return {
    code: mapped.code,
    message,
    error: message,
    retryable: mapped.retryable,
    correlationId
  };
}

export function assertPublicActivationErrorJsonSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const needle of FORBIDDEN_LOG_SUBSTRINGS) {
    if (json.includes(needle)) {
      throw new Error(`Activation error response must not include ${needle}`);
    }
  }
}
