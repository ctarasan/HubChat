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

/** Safe structured payload emitted before OAuth-managed outbound credential failures. */
export function buildFacebookOAuthOutboundFailureLogPayload(input: {
  diagnostics: ChannelConnectResolverDiagnostics;
  tenantId: string;
  providerPageId?: string | null;
  explicitChannelConnectionId: boolean;
  encryptionKeyConfigured: boolean;
}): Record<string, unknown> {
  const payload = {
    ...toChannelConnectResolverLogPayload(input.diagnostics),
    event: "facebook_oauth_outbound_credential_failure",
    tenantId: input.tenantId,
    providerPageId: input.providerPageId ?? null,
    explicitChannelConnectionIdSupplied: input.explicitChannelConnectionId,
    encryptionKeyConfigured: input.encryptionKeyConfigured,
    oauthManaged: true,
    blockLegacyFallback: true
  };
  const serialized = JSON.stringify(payload);
  if (TOKEN_LIKE.test(serialized)) {
    throw new Error("Facebook OAuth outbound failure diagnostics contain forbidden token-like values");
  }
  return payload;
}

/** One-line JSON on stderr — Railway surfaces plain console text, not optional pino object fields. */
export function emitFacebookOAuthOutboundCredentialFailure(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });
  if (TOKEN_LIKE.test(line)) {
    throw new Error("Facebook OAuth outbound failure diagnostics contain forbidden token-like values");
  }
  console.error(line);
}

export function sanitizeResolverErrorMessage(raw: unknown): string {
  return sanitizeProviderErrorMessage(raw);
}
