import type {
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto
} from "../../domain/channelConnections.js";
import type { ChannelRuntimeConfig } from "../../domain/channelSettings.js";
import type { ChannelConnectionRepository, ChannelSettingRepository } from "../../domain/ports.js";
import { readChannelCredentialEncryptionKeyFromEnv } from "../../lib/channelCredentialEncryption.js";
import { loadEnvFacebookCredentials } from "../../lib/facebookOutboundRuntimeConfig.js";
import {
  isChannelConnectResolverEnabled,
  parseChannelConnectRuntimeModeFromEnv,
  shouldAttemptChannelConnectDb
} from "../../lib/channelConnectRuntimeMode.js";

export type FacebookRuntimeCredentialSource =
  | "oauth_channel_credentials"
  | "manual_channel_settings"
  | "environment";

export type ResolvedFacebookRuntimeCredential = {
  source: FacebookRuntimeCredentialSource;
  runtime: ChannelRuntimeConfig;
  oauthManaged: boolean;
  connectionId: string | null;
};

export type OAuthManagedCredentialFailureReason =
  | "encryption_key_missing"
  | "credential_missing"
  | "credential_invalid"
  | "decrypt_failed"
  | "tenant_mismatch";

/**
 * OAuth-managed Facebook connections store the Page token only in encrypted
 * `channel_credentials` after `complete`, with `providerPageId` and `connectedAt` set.
 */
export function isOAuthManagedFacebookConnection(
  connection: ChannelConnectionRecord | null,
  credentialMetadata: ChannelCredentialMetadataDto[]
): boolean {
  if (!connection || connection.provider !== "FACEBOOK") return false;
  if (!connection.providerPageId?.trim() || !connection.connectedAt) return false;
  const accessTokenMeta = credentialMetadata.find((row) => row.credentialType === "ACCESS_TOKEN");
  if (!accessTokenMeta || accessTokenMeta.credentialState === "EMPTY") return false;
  return true;
}

export async function resolveOAuthManagedFacebookCredential(input: {
  channelConnectionRepository: ChannelConnectionRepository;
  tenantId: string;
  connection: ChannelConnectionRecord;
}): Promise<
  | { ok: true; accessToken: string; providerPageId: string | null; providerAccountName: string | null }
  | { ok: false; reason: OAuthManagedCredentialFailureReason }
> {
  if (input.connection.tenantId !== input.tenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }

  const metadata = await input.channelConnectionRepository.listCredentialMetadataByConnection(
    input.tenantId,
    input.connection.id
  );
  const accessTokenMeta = metadata.find((row) => row.credentialType === "ACCESS_TOKEN");
  if (!accessTokenMeta) {
    return { ok: false, reason: "credential_missing" };
  }
  if (accessTokenMeta.credentialState === "REVOKED" || accessTokenMeta.credentialState === "EMPTY") {
    return { ok: false, reason: "credential_invalid" };
  }
  if (accessTokenMeta.credentialState !== "SET") {
    return { ok: false, reason: "credential_invalid" };
  }

  if (!readChannelCredentialEncryptionKeyFromEnv()) {
    return { ok: false, reason: "encryption_key_missing" };
  }

  try {
    const decrypted = await input.channelConnectionRepository.retrieveDecryptedCredentialForRuntime({
      tenantId: input.tenantId,
      connectionId: input.connection.id,
      credentialType: "ACCESS_TOKEN"
    });
    if (!decrypted?.plaintextSecret?.trim()) {
      return { ok: false, reason: "decrypt_failed" };
    }
    return {
      ok: true,
      accessToken: decrypted.plaintextSecret.trim(),
      providerPageId: input.connection.providerPageId,
      providerAccountName: input.connection.providerAccountName
    };
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }
}

/**
 * Credential precedence for Facebook runtime / Test Connection:
 * 1. OAuth-managed active connection → `channel_credentials` only (no silent fallback)
 * 2. Manual `channel_settings` when no OAuth-managed connection applies
 * 3. Environment fallback only when rollout mode allows and no OAuth-managed connection exists
 */
export async function resolveFacebookRuntimeCredentialForTest(input: {
  tenantId: string;
  channelConnectionRepository: ChannelConnectionRepository;
  channelSettingRepository: ChannelSettingRepository;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: true; resolved: ResolvedFacebookRuntimeCredential } | { ok: false; message: string }> {
  const env = input.env ?? process.env;
  const connection = await input.channelConnectionRepository.findByTenantAndProvider(
    input.tenantId,
    "FACEBOOK"
  );
  const credentialMetadata = connection
    ? await input.channelConnectionRepository.listCredentialMetadataByConnection(
        input.tenantId,
        connection.id
      )
    : [];
  const oauthManaged = isOAuthManagedFacebookConnection(connection, credentialMetadata);

  if (oauthManaged && connection) {
    const oauthCred = await resolveOAuthManagedFacebookCredential({
      channelConnectionRepository: input.channelConnectionRepository,
      tenantId: input.tenantId,
      connection
    });
    if (!oauthCred.ok) {
      return { ok: false, message: "OAuth-managed credential could not be resolved." };
    }
    return {
      ok: true,
      resolved: {
        source: "oauth_channel_credentials",
        oauthManaged: true,
        connectionId: connection.id,
        runtime: {
          tenantId: input.tenantId,
          channel: "FACEBOOK",
          enabled: true,
          providerPageId: oauthCred.providerPageId,
          providerAccountName: oauthCred.providerAccountName,
          secrets: { accessToken: oauthCred.accessToken }
        }
      }
    };
  }

  const manualRuntime = await input.channelSettingRepository.getRuntimeConfigForConnectionTest({
    tenantId: input.tenantId,
    channel: "FACEBOOK"
  });
  if (manualRuntime?.secrets.accessToken?.trim()) {
    return {
      ok: true,
      resolved: {
        source: "manual_channel_settings",
        oauthManaged: false,
        connectionId: connection?.id ?? null,
        runtime: manualRuntime
      }
    };
  }

  const mode = parseChannelConnectRuntimeModeFromEnv("FACEBOOK", env);
  const resolverEnabled = isChannelConnectResolverEnabled(env);
  if (shouldAttemptChannelConnectDb(mode, resolverEnabled) && mode === "DB_ONLY") {
    return { ok: false, message: "Facebook runtime configuration is not available." };
  }

  const envCreds = loadEnvFacebookCredentials(env as import("../../lib/facebookOutboundRuntimeConfig.js").FacebookEnvInput);
  if (envCreds?.pageAccessToken?.trim()) {
    return {
      ok: true,
      resolved: {
        source: "environment",
        oauthManaged: false,
        connectionId: null,
        runtime: {
          tenantId: input.tenantId,
          channel: "FACEBOOK",
          enabled: true,
          providerPageId: env.FACEBOOK_PAGE_ID?.trim() ?? null,
          providerAccountName: null,
          secrets: { accessToken: envCreds.pageAccessToken.trim() }
        }
      }
    };
  }

  return { ok: false, message: "Required secrets or configuration are missing." };
}
