import type {
  ChannelConnectRuntimeMode,
  ChannelConnectResolverDiagnosticCode,
  ChannelConnectResolverDiagnostics
} from "../domain/channelConnectRuntime.js";
import type { ChannelConnectProvider } from "../domain/channelConnections.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

const TOKEN_LIKE = /\bEA[A-Za-z0-9]{20,}\b|\bBearer\s+\S+|\baccess_token[=:]\s*\S+/gi;

export function buildChannelConnectResolverDiagnostics(input: {
  code: ChannelConnectResolverDiagnosticCode;
  provider: ChannelConnectProvider;
  mode: ChannelConnectRuntimeMode;
  connectionId?: string | null;
  connectionStatus?: string | null;
  fallbackReason?: string | null;
}): ChannelConnectResolverDiagnostics {
  return {
    code: input.code,
    provider: input.provider,
    mode: input.mode,
    connectionId: input.connectionId ?? null,
    connectionStatus: (input.connectionStatus as ChannelConnectResolverDiagnostics["connectionStatus"]) ?? null,
    fallbackReason: input.fallbackReason ? sanitizeProviderErrorMessage(input.fallbackReason) : null
  };
}

/** Structured log payload safe for production (no secrets). */
export function toChannelConnectResolverLogPayload(
  diagnostics: ChannelConnectResolverDiagnostics
): Record<string, unknown> {
  const serialized = JSON.stringify(diagnostics);
  if (TOKEN_LIKE.test(serialized)) {
    throw new Error("Channel connect diagnostics contain forbidden token-like values");
  }
  return {
    event: "channel_connect_runtime_resolver",
    diagnosticCode: diagnostics.code,
    provider: diagnostics.provider,
    runtimeMode: diagnostics.mode,
    connectionId: diagnostics.connectionId ?? null,
    connectionStatus: diagnostics.connectionStatus ?? null,
    fallbackReason: diagnostics.fallbackReason ?? null
  };
}

export function sanitizeResolverErrorMessage(raw: unknown): string {
  return sanitizeProviderErrorMessage(raw);
}
