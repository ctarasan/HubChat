import { MetaPageCredentialActivationError } from "../domain/metaPageCredentialActivationErrors.js";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import { ChannelCredentialEncryptionError } from "./channelCredentialEncryption.js";
import { MetaPageCredentialDecryptionFailedError } from "../domain/metaPageCredentialErrors.js";
import {
  MetaPageCredentialActivationApiError,
  safeActivationPublicMessage
} from "./metaPageCredentialActivationApiErrors.js";
import {
  providerDiagnosticToLogFields,
  type ProviderVerificationDiagnostic
} from "./metaProviderVerificationDiagnostics.js";

export type MetaPageCredentialActivationStage =
  | "ROUTE_VALIDATION"
  | "AUTHORIZATION"
  | "TARGET_VALIDATION"
  | "PROVIDER_VERIFICATION"
  | "ENCRYPTION_PRECHECK"
  | "ACTIVATION_RPC"
  | "POST_COMMIT_HEALTH"
  | "UNKNOWN";

export type MetaPageCredentialActivationExecutionState = {
  commitReached: boolean;
  rpcInvoked: boolean;
  postCommitHealthReached: boolean;
};

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
  rpcInvoked: boolean;
  timestamp: string;
  providerOperation?: string;
  providerSubstage?: string;
  graphVersion?: string;
  providerHttpStatusCategory?: string;
  responseContentTypeCategory?: string;
  responseShapeCategory?: string;
  safeProviderSubcode?: string;
  hasData?: boolean;
  hasError?: boolean;
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
  "META_PROVIDER_RESPONSE_INVALID",
  "META_DEBUG_TOKEN_HTTP_REJECTED",
  "META_DEBUG_TOKEN_NON_JSON_RESPONSE",
  "META_DEBUG_TOKEN_EMPTY_RESPONSE",
  "META_DEBUG_TOKEN_MISSING_DATA",
  "META_DEBUG_TOKEN_NULL_DATA",
  "META_DEBUG_TOKEN_ERROR_SHAPED_SUCCESS",
  "META_DEBUG_TOKEN_UNEXPECTED_SHAPE",
  "META_DEBUG_TOKEN_RESPONSE_TOO_LARGE",
  "META_PAGE_IDENTITY_HTTP_REJECTED",
  "META_PAGE_IDENTITY_NON_JSON_RESPONSE",
  "META_PAGE_IDENTITY_EMPTY_RESPONSE",
  "META_PAGE_IDENTITY_UNEXPECTED_SHAPE"
]);

const PRE_RPC_ACTIVATION_DOMAIN_CODES = new Set([
  "META_CONNECTION_NOT_FOUND",
  "META_CONNECTION_TYPE_MISMATCH",
  "META_ACTIVATION_INPUT_INVALID"
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

export function createActivationExecutionState(): MetaPageCredentialActivationExecutionState {
  return {
    commitReached: false,
    rpcInvoked: false,
    postCommitHealthReached: false
  };
}

export function resolveActivationFailurePersistence(
  error: unknown,
  execution: MetaPageCredentialActivationExecutionState = createActivationExecutionState()
): MetaPageCredentialActivationExecutionState {
  if (execution.commitReached) {
    return execution;
  }

  if (error instanceof MetaPageCredentialDecryptionFailedError) {
    return {
      commitReached: true,
      rpcInvoked: true,
      postCommitHealthReached: true
    };
  }

  if (error instanceof MetaPageCredentialActivationApiError) {
    if (error.code === "META_POST_ACTIVATION_HEALTH_FAILED") {
      return {
        commitReached: true,
        rpcInvoked: true,
        postCommitHealthReached: true
      };
    }
    if (error.code === "META_ACTIVATION_FAILED" && error.httpStatus === 500) {
      return {
        commitReached: true,
        rpcInvoked: true,
        postCommitHealthReached: false
      };
    }
    return execution;
  }

  if (error instanceof MetaPageCredentialActivationError) {
    if (PRE_RPC_ACTIVATION_DOMAIN_CODES.has(error.code)) {
      return execution;
    }
    return {
      commitReached: false,
      rpcInvoked: true,
      postCommitHealthReached: false
    };
  }

  return execution;
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
    if (PRE_RPC_ACTIVATION_DOMAIN_CODES.has(error.code)) {
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
      if (mapped.httpStatus === 503 && mapped.code === "META_ACTIVATION_FAILED") {
        return "ENCRYPTION_PRECHECK";
      }
      if (mapped.httpStatus === 500 && mapped.code === "META_ACTIVATION_FAILED") {
        return "POST_COMMIT_HEALTH";
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
  commitReached: boolean;
  rpcInvoked: boolean;
  timestamp?: string;
  providerDiagnostic?: ProviderVerificationDiagnostic;
}): MetaPageCredentialActivationFailureLogEvent {
  const providerFields = input.providerDiagnostic
    ? providerDiagnosticToLogFields(input.providerDiagnostic)
    : null;
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
    commitReached: input.commitReached,
    rpcInvoked: input.rpcInvoked,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(providerFields
      ? {
          providerOperation: providerFields.providerOperation,
          providerSubstage: providerFields.providerSubstage,
          graphVersion: providerFields.graphVersion,
          providerHttpStatusCategory: providerFields.providerHttpStatusCategory,
          responseContentTypeCategory: providerFields.responseContentTypeCategory,
          responseShapeCategory: providerFields.responseShapeCategory,
          safeProviderSubcode: providerFields.safeProviderSubcode,
          ...(providerFields.hasData !== undefined ? { hasData: providerFields.hasData } : {}),
          ...(providerFields.hasError !== undefined ? { hasError: providerFields.hasError } : {})
        }
      : {})
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
  const message = safeActivationPublicMessage(mapped.code);
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
