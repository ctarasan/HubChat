import { sanitizeProviderErrorMessage } from "../../../lib/sanitizeProviderError.js";
import { MetaPageCredentialVerificationError } from "../../../domain/metaPageCredentialVerificationErrors.js";

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
    try {
      const response = await this.fetchImpl(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        signal: controller.signal
      });

      const clone = response.clone();
      const buffer = await clone.arrayBuffer();
      if (buffer.byteLength > this.maxResponseBytes) {
        throw new MetaPageCredentialVerificationError(
          "META_PROVIDER_RESPONSE_INVALID",
          "Provider response exceeded size limit",
          false
        );
      }

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const err = new MetaPageCredentialVerificationError(
          retryable ? "META_PROVIDER_UNAVAILABLE" : "META_PROVIDER_RESPONSE_INVALID",
          sanitizeProviderErrorMessage(`Graph request failed (HTTP ${response.status})`),
          retryable
        );
        if (retryable) throw new ResponseRetryMarker(err);
        throw err;
      }

      const text = await response.text();
      try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        throw new MetaPageCredentialVerificationError(
          "META_PROVIDER_RESPONSE_INVALID",
          "Provider response was not valid JSON",
          false
        );
      }
    } catch (error) {
      if (error instanceof MetaPageCredentialVerificationError) throw error;
      if (error instanceof ResponseRetryMarker) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaPageCredentialVerificationError(
          "META_PROVIDER_TIMEOUT",
          "Provider request timed out",
          true
        );
      }
      void redactUrlForLogs(request.url);
      throw new MetaPageCredentialVerificationError(
        "META_PROVIDER_UNAVAILABLE",
        sanitizeProviderErrorMessage("Provider request failed"),
        true
      );
    } finally {
      clearTimeout(timer);
    }
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
