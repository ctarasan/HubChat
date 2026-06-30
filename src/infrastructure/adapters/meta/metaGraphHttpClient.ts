import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";
import type { ProviderOperation, ProviderSubstage, ProviderResponseShapeCategory } from "../../../domain/metaPageCredentialProviderDiagnostics.js";
import {
  buildProviderVerificationDiagnostic,
  httpFailureSubcode,
  type ProviderHttpFailureKind
} from "../../../lib/metaProviderVerificationDiagnostics.js";

export type MetaGraphProviderContext = {
  providerOperation: ProviderOperation;
  graphVersion: string;
  requestSubstage: ProviderSubstage;
  parseSubstage: ProviderSubstage;
};

export type MetaGraphHttpClientConfig = {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxRetries?: number;
};

export type MetaGraphHttpRequest = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  providerContext?: MetaGraphProviderContext;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 64_000;
const DEFAULT_MAX_RETRIES = 2;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof MetaPageCredentialVerificationError) return error.retryable;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function redactUrlForLogs(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ["access_token", "input_token", "client_secret"]) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

export class MetaGraphHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxRetries: number;

  constructor(config: MetaGraphHttpClientConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_BYTES;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async requestJson(request: MetaGraphHttpRequest): Promise<Record<string, unknown>> {
    let attempt = 0;
    while (true) {
      try {
        return await this.requestJsonOnce(request);
      } catch (error) {
        const canRetry = isRetryableError(error) || error instanceof ResponseRetryMarker;
        if (!canRetry || attempt >= this.maxRetries) {
          if (error instanceof ResponseRetryMarker) {
            throw error.cause;
          }
          throw error;
        }
        attempt += 1;
      }
    }
  }

  private async requestJsonOnce(request: MetaGraphHttpRequest): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const ctx = request.providerContext;
    try {
      const response = await this.fetchImpl(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type");
      const clone = response.clone();
      const buffer = await clone.arrayBuffer();
      if (buffer.byteLength > this.maxResponseBytes) {
        const code = ctx
          ? httpFailureSubcode(ctx.providerOperation, "RESPONSE_TOO_LARGE", response.status)
          : "META_PROVIDER_RESPONSE_INVALID";
        throw this.providerFailure(
          ctx,
          "parse",
          code,
          "Provider response exceeded size limit",
          false,
          {
            httpStatus: response.status,
            contentType,
            bodyText: "",
            shapeCategory: "OVERSIZED"
          }
        );
      }

      const text = await response.text();

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const kind: ProviderHttpFailureKind = "HTTP_NON_2XX";
        const code = retryable
          ? "META_PROVIDER_UNAVAILABLE"
          : ctx
            ? httpFailureSubcode(ctx.providerOperation, kind, response.status)
            : "META_PROVIDER_RESPONSE_INVALID";
        const err = this.providerFailure(
          ctx,
          "request",
          code,
          sanitizeProviderErrorMessage(`Graph request failed (HTTP ${response.status})`),
          retryable,
          { httpStatus: response.status, contentType, bodyText: text }
        );
        if (retryable) throw new ResponseRetryMarker(err);
        throw err;
      }

      if (!text.trim() && ctx) {
        throw this.providerFailure(
          ctx,
          "parse",
          httpFailureSubcode(ctx.providerOperation, "EMPTY_BODY", response.status),
          "Provider response body was empty",
          false,
          { httpStatus: response.status, contentType, bodyText: text, shapeCategory: "EMPTY_BODY" }
        );
      }

      try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        const code = ctx
          ? httpFailureSubcode(ctx.providerOperation, "JSON_PARSE_FAILURE", response.status)
          : "META_PROVIDER_RESPONSE_INVALID";
        throw this.providerFailure(
          ctx,
          "parse",
          code,
          "Provider response was not valid JSON",
          false,
          { httpStatus: response.status, contentType, bodyText: text, shapeCategory: "NON_JSON" }
        );
      }
    } catch (error) {
      if (error instanceof MetaPageCredentialVerificationError) throw error;
      if (error instanceof ResponseRetryMarker) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaPageCredentialVerificationError(
          "META_PROVIDER_TIMEOUT",
          "Provider request timed out",
          true,
          ctx
            ? buildProviderVerificationDiagnostic({
                providerOperation: ctx.providerOperation,
                providerSubstage: ctx.requestSubstage,
                graphVersion: ctx.graphVersion,
                safeProviderSubcode: "META_PROVIDER_TIMEOUT",
                httpStatus: null,
                shapeCategory: "UNKNOWN"
              })
            : undefined
        );
      }
      void redactUrlForLogs(request.url);
      throw new MetaPageCredentialVerificationError(
        "META_PROVIDER_UNAVAILABLE",
        sanitizeProviderErrorMessage("Provider request failed"),
        true,
        ctx
          ? buildProviderVerificationDiagnostic({
              providerOperation: ctx.providerOperation,
              providerSubstage: ctx.requestSubstage,
              graphVersion: ctx.graphVersion,
              safeProviderSubcode: "META_PROVIDER_UNAVAILABLE",
              httpStatus: null,
              shapeCategory: "UNKNOWN"
            })
          : undefined
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private providerFailure(
    ctx: MetaGraphProviderContext | undefined,
    phase: "request" | "parse",
    code: MetaPageCredentialVerificationError["code"],
    message: string,
    retryable: boolean,
    detail: {
      httpStatus: number | null;
      contentType?: string | null;
      bodyText?: string;
      shapeCategory?: ProviderResponseShapeCategory;
    }
  ): MetaPageCredentialVerificationError {
    if (!ctx) {
      return new MetaPageCredentialVerificationError(code, message, retryable);
    }
    const diagnostic = buildProviderVerificationDiagnostic({
      providerOperation: ctx.providerOperation,
      providerSubstage: phase === "request" ? ctx.requestSubstage : ctx.parseSubstage,
      graphVersion: ctx.graphVersion,
      safeProviderSubcode: code,
      httpStatus: detail.httpStatus,
      contentType: detail.contentType ?? null,
      bodyText: detail.bodyText ?? "",
      shapeCategory: detail.shapeCategory
    });
    return new MetaPageCredentialVerificationError(code, message, retryable, diagnostic);
  }
}

class ResponseRetryMarker extends Error {
  constructor(readonly cause: MetaPageCredentialVerificationError) {
    super("retry");
  }
}

export function normalizeMetaGraphVersion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "v25.0";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}
