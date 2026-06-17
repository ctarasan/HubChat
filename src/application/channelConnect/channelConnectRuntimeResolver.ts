import type {
  ChannelConnectProvider,
  ChannelCredentialMetadataDto,
  ChannelCredentialRuntimeSecret,
  ChannelCredentialType,
  ChannelConnectionRecord
} from "../../domain/channelConnections.js";
import type { ChannelConnectionRepository } from "../../domain/ports.js";
import type {
  ChannelConnectRuntimeMode,
  OutboundChannelCredentialSecrets,
  ResolveCredentialMetadataForHealthInput,
  ResolveInboundChannelConnectionInput,
  ResolveOutboundChannelCredentialInput,
  ResolvedInboundChannelConnection,
  ResolvedOutboundChannelCredential
} from "../../domain/channelConnectRuntime.js";
import type { ChannelConnectResolverDiagnosticCode } from "../../domain/channelConnectRuntime.js";
import {
  INBOUND_BLOCKED_CONNECTION_STATUSES,
  OUTBOUND_READY_CONNECTION_STATUSES,
  PROVIDER_INBOUND_VERIFICATION_TYPES,
  PROVIDER_OUTBOUND_CREDENTIAL_TYPES
} from "../../domain/channelConnectRuntime.js";
import {
  buildChannelConnectResolverDiagnostics,
  buildFacebookOAuthOutboundFailureLogPayload,
  emitFacebookOAuthOutboundCredentialFailure,
  sanitizeResolverErrorMessage,
  toChannelConnectResolverLogPayload
} from "../../lib/channelConnectRuntimeDiagnostics.js";
import { shouldAttemptChannelConnectDb } from "../../lib/channelConnectRuntimeMode.js";
import {
  resolveChannelCredentialEncryptionKey,
  type ChannelCredentialEncryptionKeyResolution
} from "../../lib/channelCredentialEncryption.js";
import {
  loadEnvFacebookCredentials,
  normalizeFacebookGraphVersion,
  type FacebookEnvInput
} from "../../lib/facebookOutboundRuntimeConfig.js";
import {
  loadEnvInstagramCredentials,
  normalizeInstagramGraphVersion,
  type InstagramEnvInput
} from "../../lib/instagramOutboundRuntimeConfig.js";
import {
  loadEnvLineCredentials,
  type LineEnvInput
} from "../../lib/lineOutboundRuntimeConfig.js";
import { sanitizeProviderErrorMessage } from "../../lib/sanitizeProviderError.js";
import { isOAuthManagedFacebookConnection } from "../facebookOAuth/facebookOAuthRuntimeCredential.js";
import { resolveOutboundChannelConnectionLookup } from "../../domain/channelConnectionScope.js";

export class ChannelConnectRuntimeResolverError extends Error {
  override readonly name = "ChannelConnectRuntimeResolverError";

  constructor(
    message: string,
    readonly diagnosticCode: string,
    /** When true, worker outbound must not fall back to manual/env credentials (OAuth-managed). */
    readonly blockLegacyFallback = false
  ) {
    super(sanitizeProviderErrorMessage(message));
  }
}

async function resolveFacebookOAuthManagedContext(input: {
  repository: ChannelConnectionRepository;
  tenantId: string;
  connection: ChannelConnectionRecord | null;
}): Promise<{ oauthManaged: boolean; connection: ChannelConnectionRecord | null }> {
  const connection =
    input.connection?.provider === "FACEBOOK"
      ? input.connection
      : await input.repository.findByTenantAndProvider(input.tenantId, "FACEBOOK");
  if (!connection || connection.provider !== "FACEBOOK") {
    return { oauthManaged: false, connection: input.connection };
  }
  const metadata = await input.repository.listCredentialMetadataByConnection(
    input.tenantId,
    connection.id
  );
  return {
    oauthManaged: isOAuthManagedFacebookConnection(connection, metadata),
    connection
  };
}

function throwFacebookOAuthOutboundError(input: {
  deps: ChannelConnectRuntimeResolverDeps;
  diagnosticCode: ChannelConnectResolverDiagnosticCode;
  connection: ChannelConnectionRecord | null;
  message: string;
  mode: ChannelConnectRuntimeMode;
  tenantId: string;
  provider: ChannelConnectProvider;
  providerPageId?: string | null;
  explicitChannelConnectionId: boolean;
  encryptionKeyConfigured: boolean;
  fallbackReason?: string | null;
}): never {
  const diagnostics = buildChannelConnectResolverDiagnostics({
    code: input.diagnosticCode,
    provider: input.provider,
    mode: input.mode,
    connectionId: input.connection?.id ?? null,
    connectionStatus: input.connection?.status ?? null,
    fallbackReason: input.fallbackReason ?? input.diagnosticCode
  });
  const payload = buildFacebookOAuthOutboundFailureLogPayload({
    diagnostics,
    tenantId: input.tenantId,
    providerPageId: input.providerPageId ?? input.connection?.providerPageId ?? null,
    explicitChannelConnectionId: input.explicitChannelConnectionId,
    encryptionKeyConfigured: input.encryptionKeyConfigured
  });
  emitFacebookOAuthOutboundCredentialFailure(payload);
  if (input.deps.log) {
    input.deps.log(payload);
  }
  throw new ChannelConnectRuntimeResolverError(
    sanitizeResolverErrorMessage(input.message),
    input.diagnosticCode,
    true
  );
}

export type ChannelConnectRuntimeEnv = LineEnvInput &
  FacebookEnvInput &
  InstagramEnvInput & {
    HUBCHAT_CREDENTIAL_ENCRYPTION_KEY?: string;
  };

export type ChannelConnectRuntimeResolverDeps = {
  channelConnectionRepository: ChannelConnectionRepository;
  env?: ChannelConnectRuntimeEnv;
  log?: (payload: Record<string, unknown>) => void;
};

function isOutboundConnectionEligible(status: ChannelConnectionRecord["status"]): boolean {
  return OUTBOUND_READY_CONNECTION_STATUSES.includes(status);
}

function isInboundConnectionBlocked(status: ChannelConnectionRecord["status"]): boolean {
  return INBOUND_BLOCKED_CONNECTION_STATUSES.includes(status);
}

function providerAccountMatches(
  connection: ChannelConnectionRecord,
  providerAccountId?: string | null,
  providerPageId?: string | null
): boolean {
  if (providerAccountId?.trim()) {
    const accountId = providerAccountId.trim();
    if (connection.providerAccountId?.trim() === accountId) return true;
    if (connection.providerPageId?.trim() === accountId) return true;
    if (connection.providerIgAccountId?.trim() === accountId) return true;
    return false;
  }
  if (providerPageId?.trim()) {
    return connection.providerPageId?.trim() === providerPageId.trim();
  }
  return true;
}

function mapCredentialTypeToSecretField(
  credentialType: ChannelCredentialType
): keyof OutboundChannelCredentialSecrets {
  switch (credentialType) {
    case "ACCESS_TOKEN":
      return "accessToken";
    case "CHANNEL_SECRET":
      return "channelSecret";
    case "APP_SECRET":
      return "appSecret";
    case "VERIFY_TOKEN":
      return "verifyToken";
    case "REFRESH_TOKEN":
      return "refreshToken";
    default:
      return "accessToken";
  }
}

function envSecretsForProvider(
  provider: ChannelConnectProvider,
  env: ChannelConnectRuntimeEnv
): OutboundChannelCredentialSecrets | null {
  switch (provider) {
    case "LINE": {
      const creds = loadEnvLineCredentials(env);
      if (!creds) return null;
      return {
        accessToken: creds.channelAccessToken,
        channelSecret: creds.channelSecret
      };
    }
    case "FACEBOOK": {
      const creds = loadEnvFacebookCredentials(env);
      if (!creds) return null;
      return { accessToken: creds.pageAccessToken };
    }
    case "INSTAGRAM": {
      const creds = loadEnvInstagramCredentials(env);
      if (!creds) return null;
      return { accessToken: creds.accessToken };
    }
    default:
      return null;
  }
}

function graphVersionForProvider(provider: ChannelConnectProvider, env: ChannelConnectRuntimeEnv): string | null {
  switch (provider) {
    case "FACEBOOK":
      return normalizeFacebookGraphVersion(env);
    case "INSTAGRAM":
      return normalizeInstagramGraphVersion(env);
    default:
      return null;
  }
}

function providerPageIdFromEnv(provider: ChannelConnectProvider, env: ChannelConnectRuntimeEnv): string | null {
  switch (provider) {
    case "FACEBOOK":
      return env.FACEBOOK_PAGE_ID?.trim() || null;
    case "INSTAGRAM":
      return (env.FACEBOOK_PAGE_ID?.trim() || env.INSTAGRAM_PAGE_ID?.trim()) || null;
    default:
      return null;
  }
}

function providerIgAccountIdFromEnv(env: ChannelConnectRuntimeEnv): string | null {
  return env.INSTAGRAM_ACCOUNT_ID?.trim() || null;
}

async function loadOutboundSecretsFromConnection(input: {
  repository: ChannelConnectionRepository;
  tenantId: string;
  connection: ChannelConnectionRecord;
  provider: ChannelConnectProvider;
  keyResolution: ChannelCredentialEncryptionKeyResolution;
}): Promise<
  | { ok: true; secrets: OutboundChannelCredentialSecrets }
  | {
      ok: false;
      code:
        | "encryption_key_missing"
        | "encryption_key_invalid"
        | "credential_decrypt_failed"
        | "credential_state_invalid"
        | "db_credential_missing";
    }
> {
  if (input.keyResolution.status === "missing") {
    return { ok: false, code: "encryption_key_missing" };
  }
  if (input.keyResolution.status === "invalid_format") {
    return { ok: false, code: "encryption_key_invalid" };
  }

  const requiredTypes = PROVIDER_OUTBOUND_CREDENTIAL_TYPES[input.provider];
  const secrets: OutboundChannelCredentialSecrets = {};

  for (const credentialType of requiredTypes) {
    const metadata = await input.repository.listCredentialMetadataByConnection(
      input.tenantId,
      input.connection.id
    );
    const row = metadata.find((item: ChannelCredentialMetadataDto) => item.credentialType === credentialType);
    if (!row || row.credentialState !== "SET") {
      return { ok: false, code: row ? "credential_state_invalid" : "db_credential_missing" };
    }

    let decrypted: ChannelCredentialRuntimeSecret | null;
    try {
      decrypted = await input.repository.retrieveDecryptedCredentialForRuntime({
        tenantId: input.tenantId,
        connectionId: input.connection.id,
        credentialType
      });
    } catch {
      return { ok: false, code: "credential_decrypt_failed" };
    }

    if (!decrypted?.plaintextSecret?.trim()) {
      return { ok: false, code: "credential_decrypt_failed" };
    }

    secrets[mapCredentialTypeToSecretField(credentialType)] = decrypted.plaintextSecret.trim();
  }

  return { ok: true, secrets };
}

async function loadInboundVerificationFromConnection(input: {
  repository: ChannelConnectionRepository;
  tenantId: string;
  connection: ChannelConnectionRecord;
  provider: ChannelConnectProvider;
  keyResolution: ChannelCredentialEncryptionKeyResolution;
}): Promise<
  | { ok: true; material: ResolvedInboundChannelConnection["verificationMaterial"] }
  | {
      ok: false;
      code:
        | "encryption_key_missing"
        | "encryption_key_invalid"
        | "credential_decrypt_failed"
        | "credential_state_invalid"
        | "db_credential_missing";
    }
> {
  if (input.keyResolution.status === "missing") {
    return { ok: false, code: "encryption_key_missing" };
  }
  if (input.keyResolution.status === "invalid_format") {
    return { ok: false, code: "encryption_key_invalid" };
  }

  const requiredTypes = PROVIDER_INBOUND_VERIFICATION_TYPES[input.provider];
  const material: ResolvedInboundChannelConnection["verificationMaterial"] = {};

  for (const credentialType of requiredTypes) {
    const metadata = await input.repository.listCredentialMetadataByConnection(
      input.tenantId,
      input.connection.id
    );
    const row = metadata.find((item: ChannelCredentialMetadataDto) => item.credentialType === credentialType);
    if (!row || row.credentialState !== "SET") {
      return { ok: false, code: row ? "credential_state_invalid" : "db_credential_missing" };
    }

    let decrypted: ChannelCredentialRuntimeSecret | null;
    try {
      decrypted = await input.repository.retrieveDecryptedCredentialForRuntime({
        tenantId: input.tenantId,
        connectionId: input.connection.id,
        credentialType
      });
    } catch {
      return { ok: false, code: "credential_decrypt_failed" };
    }

    if (!decrypted?.plaintextSecret?.trim()) {
      return { ok: false, code: "credential_decrypt_failed" };
    }

    material[mapCredentialTypeToSecretField(credentialType) as "channelSecret" | "appSecret" | "verifyToken"] =
      decrypted.plaintextSecret.trim();
  }

  return { ok: true, material };
}

async function findConnectionForOutbound(input: {
  repository: ChannelConnectionRepository;
  tenantId: string;
  provider: ChannelConnectProvider;
  channelConnectionId?: string | null;
  providerAccountId?: string | null;
  providerPageId?: string | null;
}): Promise<
  | { connection: ChannelConnectionRecord; lookupReason?: null }
  | { connection: null; lookupReason: "explicit_not_found" | "no_match" | "ambiguous_match" }
> {
  const connections = await input.repository.listByTenant(input.tenantId);
  const lookup = resolveOutboundChannelConnectionLookup({
    channel: input.provider,
    connections,
    channelConnectionId: input.channelConnectionId,
    providerPageId: input.providerPageId,
    providerAccountId: input.providerAccountId
  });

  if (lookup.ok) {
    const connection = connections.find((row) => row.id === lookup.connectionId) ?? null;
    if (connection && connection.provider === input.provider) {
      return { connection };
    }
    return { connection: null, lookupReason: "no_match" };
  }

  if (
    lookup.reason === "no_match" &&
    !input.channelConnectionId?.trim() &&
    !input.providerPageId?.trim() &&
    input.providerAccountId?.trim()
  ) {
    const byAccount = await input.repository.findByTenantProviderAccount({
      tenantId: input.tenantId,
      provider: input.provider,
      providerAccountId: input.providerAccountId.trim()
    });
    if (byAccount) {
      return { connection: byAccount };
    }
  }

  if (
    lookup.reason === "no_match" &&
    !input.channelConnectionId?.trim() &&
    !input.providerPageId?.trim() &&
    !input.providerAccountId?.trim()
  ) {
    const byProvider = await input.repository.findByTenantAndProvider(input.tenantId, input.provider);
    if (byProvider) {
      return { connection: byProvider };
    }
  }

  return { connection: null, lookupReason: lookup.reason };
}

function emitResolverLog(
  deps: ChannelConnectRuntimeResolverDeps,
  diagnostics: ReturnType<typeof buildChannelConnectResolverDiagnostics>
): void {
  if (!deps.log) return;
  deps.log(toChannelConnectResolverLogPayload(diagnostics));
}

function buildOutboundFromEnv(input: {
  provider: ChannelConnectProvider;
  mode: ChannelConnectRuntimeMode;
  env: ChannelConnectRuntimeEnv;
  diagnosticCode: "env_fallback_used" | "resolver_disabled_legacy_env" | "env_fallback_missing";
  fallbackReason?: string;
}): ResolvedOutboundChannelCredential {
  const envSecrets = envSecretsForProvider(input.provider, input.env);
  const diagnostics = buildChannelConnectResolverDiagnostics({
    code: envSecrets ? input.diagnosticCode : "env_fallback_missing",
    provider: input.provider,
    mode: input.mode,
    fallbackReason: input.fallbackReason ?? (envSecrets ? "env_credentials_loaded" : "env_credentials_missing")
  });

  if (!envSecrets) {
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage(`${input.provider} outbound credentials are unavailable.`),
      input.mode === "DB_ONLY" ? "db_only_missing_config" : "env_fallback_missing"
    );
  }

  return {
    provider: input.provider,
    configSource: input.mode === "ENV_ONLY" || input.diagnosticCode === "resolver_disabled_legacy_env" ? "ENV_ONLY" : "ENV_FALLBACK",
    connectionId: null,
    providerAccountId: null,
    providerPageId: providerPageIdFromEnv(input.provider, input.env),
    providerIgAccountId: input.provider === "INSTAGRAM" ? providerIgAccountIdFromEnv(input.env) : null,
    graphVersion: graphVersionForProvider(input.provider, input.env),
    credentials: envSecrets,
    diagnostics
  };
}

export async function resolveOutboundChannelCredential(
  deps: ChannelConnectRuntimeResolverDeps,
  input: ResolveOutboundChannelCredentialInput
): Promise<ResolvedOutboundChannelCredential> {
  const env = deps.env ?? (process.env as ChannelConnectRuntimeEnv);
  const keyResolution = resolveChannelCredentialEncryptionKey({ env });
  const encryptionKeyConfigured = keyResolution.status === "configured";
  const oauthFailureBase = {
    deps,
    mode: input.mode,
    tenantId: input.tenantId,
    provider: input.provider,
    providerPageId: input.providerPageId,
    explicitChannelConnectionId: Boolean(input.channelConnectionId?.trim()),
    encryptionKeyConfigured
  };

  if (input.mode === "ENV_ONLY" || !shouldAttemptChannelConnectDb(input.mode, input.resolverEnabled)) {
    const result = buildOutboundFromEnv({
      provider: input.provider,
      mode: input.mode,
      env,
      diagnosticCode: input.resolverEnabled ? "env_fallback_used" : "resolver_disabled_legacy_env"
    });
    emitResolverLog(deps, result.diagnostics);
    return result;
  }

  const outboundLookup = await findConnectionForOutbound({
    repository: deps.channelConnectionRepository,
    tenantId: input.tenantId,
    provider: input.provider,
    channelConnectionId: input.channelConnectionId,
    providerAccountId: input.providerAccountId,
    providerPageId: input.providerPageId
  });
  const connection = outboundLookup.connection;

  const facebookOAuthContext =
    input.provider === "FACEBOOK"
      ? await resolveFacebookOAuthManagedContext({
          repository: deps.channelConnectionRepository,
          tenantId: input.tenantId,
          connection
        })
      : { oauthManaged: false, connection };

  if (!connection) {
    if (outboundLookup.lookupReason === "ambiguous_match") {
      const diagnostics = buildChannelConnectResolverDiagnostics({
        code: "ambiguous_channel_connection",
        provider: input.provider,
        mode: input.mode,
        fallbackReason: "multiple_ready_connections_for_page"
      });
      emitResolverLog(deps, diagnostics);
      throw new ChannelConnectRuntimeResolverError(
        sanitizeResolverErrorMessage(`${input.provider} channel connection is ambiguous for this Page.`),
        "ambiguous_channel_connection",
        input.provider === "FACEBOOK" && facebookOAuthContext.oauthManaged
      );
    }
    if (outboundLookup.lookupReason === "explicit_not_found") {
      if (facebookOAuthContext.oauthManaged) {
        throwFacebookOAuthOutboundError({
          ...oauthFailureBase,
          diagnosticCode: "connection_not_found",
          connection: facebookOAuthContext.connection,
          message: "Facebook OAuth outbound credential is not available for this conversation."
        });
      }
      if (input.mode === "DB_ONLY") {
        throw new ChannelConnectRuntimeResolverError(
          sanitizeResolverErrorMessage(`${input.provider} channel connection was not found for this conversation.`),
          "connection_not_found"
        );
      }
    }
    if (facebookOAuthContext.oauthManaged) {
      throwFacebookOAuthOutboundError({
        ...oauthFailureBase,
        diagnosticCode: "db_credential_missing",
        connection: facebookOAuthContext.connection,
        message: "Facebook OAuth outbound credential is not available for this Page."
      });
    }
    if (input.mode === "DB_ONLY") {
      const diagnostics = buildChannelConnectResolverDiagnostics({
        code: "db_only_missing_config",
        provider: input.provider,
        mode: input.mode,
        fallbackReason: "connection_not_found"
      });
      emitResolverLog(deps, diagnostics);
      throw new ChannelConnectRuntimeResolverError(
        sanitizeResolverErrorMessage(`${input.provider} channel connection is not configured.`),
        "db_only_missing_config"
      );
    }

    const fallback = buildOutboundFromEnv({
      provider: input.provider,
      mode: input.mode,
      env,
      diagnosticCode: "env_fallback_used",
      fallbackReason: "db_connection_missing"
    });
    fallback.diagnostics = buildChannelConnectResolverDiagnostics({
      code: "db_connection_missing",
      provider: input.provider,
      mode: input.mode,
      fallbackReason: "connection_not_found"
    });
    emitResolverLog(deps, fallback.diagnostics);
    return fallback;
  }

  if (!isOutboundConnectionEligible(connection.status)) {
    if (facebookOAuthContext.oauthManaged) {
      throwFacebookOAuthOutboundError({
        ...oauthFailureBase,
        diagnosticCode: "connection_status_invalid",
        connection,
        message: "Facebook OAuth connection is not ready for outbound.",
        fallbackReason: "connection_not_ready"
      });
    }
    if (input.mode === "DB_ONLY") {
      const diagnostics = buildChannelConnectResolverDiagnostics({
        code: "connection_status_invalid",
        provider: input.provider,
        mode: input.mode,
        connectionId: connection.id,
        connectionStatus: connection.status,
        fallbackReason: "connection_not_ready"
      });
      emitResolverLog(deps, diagnostics);
      throw new ChannelConnectRuntimeResolverError(
        sanitizeResolverErrorMessage(`${input.provider} channel connection is not ready.`),
        "connection_status_invalid"
      );
    }

    const fallback = buildOutboundFromEnv({
      provider: input.provider,
      mode: input.mode,
      env,
      diagnosticCode: "env_fallback_used",
      fallbackReason: "connection_status_invalid"
    });
    fallback.diagnostics = buildChannelConnectResolverDiagnostics({
      code: "connection_status_invalid",
      provider: input.provider,
      mode: input.mode,
      connectionId: connection.id,
      connectionStatus: connection.status,
      fallbackReason: "connection_not_ready"
    });
    emitResolverLog(deps, fallback.diagnostics);
    return fallback;
  }

  if (
    !input.channelConnectionId?.trim() &&
    (input.providerAccountId?.trim() || input.providerPageId?.trim()) &&
    !providerAccountMatches(connection, input.providerAccountId, input.providerPageId)
  ) {
    if (facebookOAuthContext.oauthManaged) {
      throwFacebookOAuthOutboundError({
        ...oauthFailureBase,
        diagnosticCode: "provider_account_mismatch",
        connection,
        message: "Facebook OAuth Page does not match the outbound conversation."
      });
    }
    if (input.mode === "DB_ONLY") {
      throw new ChannelConnectRuntimeResolverError(
        sanitizeResolverErrorMessage(`${input.provider} provider account does not match connection.`),
        "provider_account_mismatch"
      );
    }
    const fallback = buildOutboundFromEnv({
      provider: input.provider,
      mode: input.mode,
      env,
      diagnosticCode: "env_fallback_used",
      fallbackReason: "provider_account_mismatch"
    });
    fallback.diagnostics = buildChannelConnectResolverDiagnostics({
      code: "provider_account_mismatch",
      provider: input.provider,
      mode: input.mode,
      connectionId: connection.id,
      fallbackReason: "provider_account_mismatch"
    });
    emitResolverLog(deps, fallback.diagnostics);
    return fallback;
  }

  const loaded = await loadOutboundSecretsFromConnection({
    repository: deps.channelConnectionRepository,
    tenantId: input.tenantId,
    connection,
    provider: input.provider,
    keyResolution
  });

  if (!loaded.ok) {
    const diagnosticCode =
      loaded.code === "encryption_key_missing"
        ? "encryption_key_missing"
        : loaded.code === "encryption_key_invalid"
          ? "encryption_key_invalid"
          : loaded.code === "credential_decrypt_failed"
            ? "credential_decrypt_failed"
            : loaded.code === "credential_state_invalid"
              ? "credential_state_invalid"
              : "db_credential_missing";

    if (facebookOAuthContext.oauthManaged) {
      throwFacebookOAuthOutboundError({
        ...oauthFailureBase,
        diagnosticCode,
        connection,
        message: `${input.provider} OAuth credentials are unavailable.`,
        fallbackReason: loaded.code
      });
    }

    if (input.mode === "DB_ONLY") {
      const diagnostics = buildChannelConnectResolverDiagnostics({
        code: input.mode === "DB_ONLY" && loaded.code === "encryption_key_missing" ? "encryption_key_missing" : diagnosticCode,
        provider: input.provider,
        mode: input.mode,
        connectionId: connection.id,
        connectionStatus: connection.status,
        fallbackReason: loaded.code
      });
      emitResolverLog(deps, diagnostics);
      throw new ChannelConnectRuntimeResolverError(
        sanitizeResolverErrorMessage(`${input.provider} channel credentials are unavailable.`),
        input.mode === "DB_ONLY" ? "db_only_missing_config" : diagnosticCode
      );
    }

    const fallback = buildOutboundFromEnv({
      provider: input.provider,
      mode: input.mode,
      env,
      diagnosticCode: "env_fallback_used",
      fallbackReason: loaded.code
    });
    fallback.diagnostics = buildChannelConnectResolverDiagnostics({
      code: diagnosticCode,
      provider: input.provider,
      mode: input.mode,
      connectionId: connection.id,
      connectionStatus: connection.status,
      fallbackReason: loaded.code
    });
    emitResolverLog(deps, fallback.diagnostics);
    return fallback;
  }

  const diagnostics = buildChannelConnectResolverDiagnostics({
    code: "db_credential_found",
    provider: input.provider,
    mode: input.mode,
    connectionId: connection.id,
    connectionStatus: connection.status
  });
  emitResolverLog(deps, diagnostics);

  return {
    provider: input.provider,
    configSource: "DB",
    connectionId: connection.id,
    providerAccountId: connection.providerAccountId,
    providerPageId: connection.providerPageId,
    providerIgAccountId: connection.providerIgAccountId,
    graphVersion: graphVersionForProvider(input.provider, env),
    credentials: loaded.secrets,
    diagnostics
  };
}

export async function resolveInboundChannelConnection(
  deps: ChannelConnectRuntimeResolverDeps,
  input: ResolveInboundChannelConnectionInput
): Promise<ResolvedInboundChannelConnection> {
  const env = deps.env ?? (process.env as ChannelConnectRuntimeEnv);
  const keyResolution = resolveChannelCredentialEncryptionKey({ env });
  const provider = input.expectedProvider ?? input.provider;

  let connection: ChannelConnectionRecord | null = null;

  if (input.publicConnectionKey?.trim()) {
    connection = await deps.channelConnectionRepository.findByPublicConnectionKey(input.publicConnectionKey.trim());
  } else if (input.tenantId?.trim() && input.providerAccountId?.trim()) {
    connection = await deps.channelConnectionRepository.findByTenantProviderAccount({
      tenantId: input.tenantId.trim(),
      provider: input.provider,
      providerAccountId: input.providerAccountId.trim()
    });
  } else if (input.tenantId?.trim()) {
    connection = await deps.channelConnectionRepository.findByTenantAndProvider(input.tenantId.trim(), input.provider);
  }

  if (!connection) {
    const diagnostics = buildChannelConnectResolverDiagnostics({
      code: "db_connection_missing",
      provider,
      mode: "DB_ONLY",
      fallbackReason: "connection_not_found"
    });
    emitResolverLog(deps, diagnostics);
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel connection was not found."),
      "db_connection_missing"
    );
  }

  if (connection.provider !== provider) {
    const diagnostics = buildChannelConnectResolverDiagnostics({
      code: "provider_account_mismatch",
      provider,
      mode: "DB_ONLY",
      connectionId: connection.id,
      fallbackReason: "provider_mismatch"
    });
    emitResolverLog(deps, diagnostics);
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel connection provider mismatch."),
      "provider_account_mismatch"
    );
  }

  if (input.tenantId?.trim() && connection.tenantId !== input.tenantId.trim()) {
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel connection tenant scope mismatch."),
      "provider_account_mismatch"
    );
  }

  if (
    !providerAccountMatches(connection, input.providerAccountId, input.providerPageId)
  ) {
    const diagnostics = buildChannelConnectResolverDiagnostics({
      code: "provider_account_mismatch",
      provider,
      mode: "DB_ONLY",
      connectionId: connection.id,
      fallbackReason: "account_mismatch"
    });
    emitResolverLog(deps, diagnostics);
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel connection account mismatch."),
      "provider_account_mismatch"
    );
  }

  if (isInboundConnectionBlocked(connection.status)) {
    const diagnostics = buildChannelConnectResolverDiagnostics({
      code: "connection_status_invalid",
      provider,
      mode: "DB_ONLY",
      connectionId: connection.id,
      connectionStatus: connection.status,
      fallbackReason: connection.status === "REVOKED" ? "connection_revoked" : "connection_error"
    });
    emitResolverLog(deps, diagnostics);
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel connection is not available for inbound verification."),
      "connection_status_invalid"
    );
  }

  const loaded = await loadInboundVerificationFromConnection({
    repository: deps.channelConnectionRepository,
    tenantId: connection.tenantId,
    connection,
    provider,
    keyResolution
  });

  if (!loaded.ok) {
    const diagnosticCode =
      loaded.code === "encryption_key_missing"
        ? "encryption_key_missing"
        : loaded.code === "encryption_key_invalid"
          ? "encryption_key_invalid"
          : loaded.code === "credential_decrypt_failed"
            ? "credential_decrypt_failed"
            : loaded.code === "credential_state_invalid"
              ? "credential_state_invalid"
              : "db_credential_missing";
    const diagnostics = buildChannelConnectResolverDiagnostics({
      code: diagnosticCode,
      provider,
      mode: "DB_ONLY",
      connectionId: connection.id,
      connectionStatus: connection.status,
      fallbackReason: loaded.code
    });
    emitResolverLog(deps, diagnostics);
    throw new ChannelConnectRuntimeResolverError(
      sanitizeResolverErrorMessage("Channel inbound verification material is unavailable."),
      diagnosticCode
    );
  }

  const diagnostics = buildChannelConnectResolverDiagnostics({
    code: "db_credential_found",
    provider,
    mode: "DB_ONLY",
    connectionId: connection.id,
    connectionStatus: connection.status
  });
  emitResolverLog(deps, diagnostics);

  return {
    tenantId: connection.tenantId,
    connectionId: connection.id,
    provider: connection.provider,
    publicConnectionKey: connection.publicConnectionKey,
    status: connection.status,
    providerAccountId: connection.providerAccountId,
    providerPageId: connection.providerPageId,
    providerIgAccountId: connection.providerIgAccountId,
    verificationMaterial: loaded.material,
    diagnostics
  };
}

export async function resolveChannelConnectionByProviderAccount(
  deps: ChannelConnectRuntimeResolverDeps,
  input: {
    tenantId: string;
    provider: ChannelConnectProvider;
    providerAccountId: string;
  }
): Promise<ChannelConnectionRecord | null> {
  return deps.channelConnectionRepository.findByTenantProviderAccount({
    tenantId: input.tenantId,
    provider: input.provider,
    providerAccountId: input.providerAccountId.trim()
  });
}

export async function resolveChannelConnectionByPublicKey(
  deps: ChannelConnectRuntimeResolverDeps,
  publicConnectionKey: string
): Promise<ChannelConnectionRecord | null> {
  const key = publicConnectionKey.trim();
  if (!key) return null;
  return deps.channelConnectionRepository.findByPublicConnectionKey(key);
}

export async function resolveCredentialMetadataForHealth(
  deps: ChannelConnectRuntimeResolverDeps,
  input: ResolveCredentialMetadataForHealthInput
): Promise<ChannelCredentialMetadataDto[]> {
  return deps.channelConnectionRepository.listCredentialMetadataByConnection(input.tenantId, input.connectionId);
}

export { sanitizeProviderErrorMessage };
