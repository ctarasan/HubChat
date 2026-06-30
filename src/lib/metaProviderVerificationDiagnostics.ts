import type { MetaPageCredentialVerificationErrorCode } from "../domain/metaPageCredentialVerificationErrors.js";
import { MetaPageCredentialVerificationError } from "../domain/metaPageCredentialVerificationErrors.js";
import type {
  ProviderContentTypeCategory,
  ProviderHttpStatusCategory,
  ProviderOperation,
  ProviderResponseShapeCategory,
  ProviderSubstage,
  ProviderVerificationDiagnostic,
  ProviderVerificationFailureLogFields
} from "../domain/metaPageCredentialProviderDiagnostics.js";

export type ProviderHttpFailureKind =
  | "HTTP_NON_2XX"
  | "NON_JSON"
  | "EMPTY_BODY"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "ABORTED"
  | "UNEXPECTED_CONTENT_TYPE"
  | "JSON_PARSE_FAILURE";

export type {
  ProviderContentTypeCategory,
  ProviderHttpStatusCategory,
  ProviderOperation,
  ProviderResponseShapeCategory,
  ProviderSubstage,
  ProviderVerificationDiagnostic,
  ProviderVerificationFailureLogFields
} from "../domain/metaPageCredentialProviderDiagnostics.js";

const FORBIDDEN_PROVIDER_LOG_SUBSTRINGS = [
  "accessToken",
  "access_token",
  "input_token",
  "Authorization",
  "Bearer ",
  "TEST_FAKE_TOKEN_MUST_NOT_LOG",
  "TEST_RAW_META_BODY_MUST_NOT_LOG",
  "TEST_AUTHORIZATION_HEADER_MUST_NOT_LOG",
  "EAA"
] as const;

export function classifyProviderHttpStatusCategory(status: number | null): ProviderHttpStatusCategory {
  if (status == null) return "NONE";
  if (status >= 200 && status < 300) return "2XX";
  if (status === 429) return "429";
  if (status >= 400 && status < 500) return "4XX";
  if (status >= 500) return "5XX";
  return "OTHER";
}

export function classifyProviderContentTypeCategory(
  contentType: string | null | undefined,
  bodyText: string
): ProviderContentTypeCategory {
  if (!bodyText.trim()) return "EMPTY";
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized.includes("json")) return "JSON";
  if (!normalized) {
    const trimmed = bodyText.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
    return "NON_JSON";
  }
  return "NON_JSON";
}

export function classifyProviderJsonShape(parsed: unknown, bodyText: string): ProviderResponseShapeCategory {
  if (!bodyText.trim()) return "EMPTY_BODY";
  if (parsed == null) return "UNKNOWN";
  if (Array.isArray(parsed)) return "ARRAY";
  if (typeof parsed !== "object") return "PRIMITIVE";
  const record = parsed as Record<string, unknown>;
  if ("error" in record && record.error != null && typeof record.error === "object") {
    return "JSON_ERROR_OBJECT";
  }
  if ("data" in record) {
    if (record.data == null) return "JSON_DATA_NULL";
    if (typeof record.data === "object") return "JSON_OBJECT_WITH_DATA";
  }
  if (Object.keys(record).length === 0) return "JSON_OBJECT";
  return "JSON_OBJECT";
}

export function providerJsonObjectFlags(parsed: unknown): { hasData: boolean; hasError: boolean } {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { hasData: false, hasError: false };
  }
  const record = parsed as Record<string, unknown>;
  return {
    hasData: "data" in record && record.data != null && typeof record.data === "object",
    hasError: "error" in record && record.error != null && typeof record.error === "object"
  };
}

export function buildProviderVerificationDiagnostic(input: {
  providerOperation: ProviderOperation;
  providerSubstage: ProviderSubstage;
  graphVersion: string;
  safeProviderSubcode: MetaPageCredentialVerificationErrorCode;
  httpStatus?: number | null;
  contentType?: string | null;
  bodyText?: string;
  parsed?: unknown;
  shapeCategory?: ProviderResponseShapeCategory;
  hasData?: boolean;
  hasError?: boolean;
}): ProviderVerificationDiagnostic {
  const bodyText = input.bodyText ?? "";
  const parsed = input.parsed ?? (bodyText ? tryParseJson(bodyText) : null);
  const shapeCategory =
    input.shapeCategory ??
    (input.httpStatus != null && input.httpStatus >= 200 && input.httpStatus < 300
      ? classifyProviderJsonShape(parsed, bodyText)
      : bodyText.trim()
        ? classifyProviderJsonShape(parsed, bodyText)
        : "EMPTY_BODY");

  const flags =
    input.hasData !== undefined || input.hasError !== undefined
      ? { hasData: input.hasData ?? false, hasError: input.hasError ?? false }
      : providerJsonObjectFlags(parsed);

  const diagnostic: ProviderVerificationDiagnostic = {
    providerOperation: input.providerOperation,
    providerSubstage: input.providerSubstage,
    graphVersion: normalizeLoggedGraphVersion(input.graphVersion),
    providerHttpStatusCategory: classifyProviderHttpStatusCategory(input.httpStatus ?? null),
    responseContentTypeCategory: classifyProviderContentTypeCategory(input.contentType ?? null, bodyText),
    responseShapeCategory: shapeCategory,
    safeProviderSubcode: input.safeProviderSubcode,
    ...(input.hasData !== undefined || input.hasError !== undefined
      ? { hasData: flags.hasData, hasError: flags.hasError }
      : flags.hasData || flags.hasError
        ? flags
        : {})
  };
  assertProviderVerificationDiagnosticSafe(diagnostic);
  return diagnostic;
}

export function providerDiagnosticToLogFields(
  diagnostic: ProviderVerificationDiagnostic
): ProviderVerificationFailureLogFields {
  return {
    providerOperation: diagnostic.providerOperation,
    providerSubstage: diagnostic.providerSubstage,
    graphVersion: diagnostic.graphVersion,
    providerHttpStatusCategory: diagnostic.providerHttpStatusCategory,
    responseContentTypeCategory: diagnostic.responseContentTypeCategory,
    responseShapeCategory: diagnostic.responseShapeCategory,
    safeProviderSubcode: diagnostic.safeProviderSubcode,
    ...(diagnostic.hasData !== undefined ? { hasData: diagnostic.hasData } : {}),
    ...(diagnostic.hasError !== undefined ? { hasError: diagnostic.hasError } : {})
  };
}

export function httpFailureSubcode(
  operation: ProviderOperation,
  kind: ProviderHttpFailureKind,
  httpStatus: number | null
): MetaPageCredentialVerificationErrorCode {
  if (kind === "RESPONSE_TOO_LARGE") {
    return operation === "DEBUG_TOKEN"
      ? "META_DEBUG_TOKEN_RESPONSE_TOO_LARGE"
      : "META_PAGE_IDENTITY_UNEXPECTED_SHAPE";
  }
  if (kind === "NON_JSON" || kind === "JSON_PARSE_FAILURE") {
    return operation === "DEBUG_TOKEN"
      ? "META_DEBUG_TOKEN_NON_JSON_RESPONSE"
      : "META_PAGE_IDENTITY_NON_JSON_RESPONSE";
  }
  if (kind === "EMPTY_BODY") {
    return operation === "DEBUG_TOKEN"
      ? "META_DEBUG_TOKEN_EMPTY_RESPONSE"
      : "META_PAGE_IDENTITY_EMPTY_RESPONSE";
  }
  if (kind === "HTTP_NON_2XX" && httpStatus != null && httpStatus >= 400 && httpStatus < 500) {
    return operation === "DEBUG_TOKEN"
      ? "META_DEBUG_TOKEN_HTTP_REJECTED"
      : "META_PAGE_IDENTITY_HTTP_REJECTED";
  }
  return "META_PROVIDER_RESPONSE_INVALID";
}

export function debugTokenShapeSubcode(
  shape: ProviderResponseShapeCategory,
  flags: { hasData: boolean; hasError: boolean }
): MetaPageCredentialVerificationErrorCode {
  if (shape === "JSON_DATA_NULL") return "META_DEBUG_TOKEN_NULL_DATA";
  if (shape === "JSON_ERROR_OBJECT" || flags.hasError) return "META_DEBUG_TOKEN_ERROR_SHAPED_SUCCESS";
  if (shape === "EMPTY_BODY") return "META_DEBUG_TOKEN_EMPTY_RESPONSE";
  if (shape === "JSON_OBJECT" && !flags.hasData) return "META_DEBUG_TOKEN_MISSING_DATA";
  return "META_DEBUG_TOKEN_UNEXPECTED_SHAPE";
}

export function pageIdentityShapeSubcode(
  shape: ProviderResponseShapeCategory
): MetaPageCredentialVerificationErrorCode {
  if (shape === "JSON_ERROR_OBJECT") return "META_PAGE_IDENTITY_UNEXPECTED_SHAPE";
  if (shape === "EMPTY_BODY") return "META_PAGE_IDENTITY_EMPTY_RESPONSE";
  if (shape === "NON_JSON") return "META_PAGE_IDENTITY_NON_JSON_RESPONSE";
  return "META_PAGE_IDENTITY_UNEXPECTED_SHAPE";
}

export function extractProviderDiagnostic(error: unknown): ProviderVerificationDiagnostic | undefined {
  if (error instanceof MetaPageCredentialVerificationError) {
    return error.providerDiagnostic;
  }
  return undefined;
}

export function assertProviderVerificationDiagnosticSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const needle of FORBIDDEN_PROVIDER_LOG_SUBSTRINGS) {
    if (json.includes(needle)) {
      throw new Error(`Provider verification diagnostic must not include ${needle}`);
    }
  }
}

function normalizeLoggedGraphVersion(value: string): string {
  const trimmed = value.trim();
  return trimmed || "v25.0";
}

function tryParseJson(bodyText: string): unknown {
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return null;
  }
}
