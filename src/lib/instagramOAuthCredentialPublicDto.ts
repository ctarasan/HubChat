import type {
  InstagramOAuthCredentialMetadata,
  InstagramOAuthCredentialRecord
} from "../domain/instagramOAuthCredentials.js";

type CredentialRow = {
  id: string;
  tenant_id: string;
  channel_connection_id: string;
  provider: string;
  auth_family: string;
  credential_status: string;
  token_type: string;
  token_expires_at: string | null;
  refresh_eligible_at: string | null;
  last_refresh_at: string | null;
  last_refresh_status: string;
  last_refresh_error_code: string | null;
  granted_scopes: string[] | null;
  provider_instagram_account_id: string | null;
  provider_user_id: string | null;
  connected_by_sales_agent_id: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  reauth_required_at: string | null;
  connection_health_status: string;
  credential_version: number;
  secret_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

const BLOCKED_METADATA_KEYS = new Set([
  "access_token_ciphertext",
  "accessTokenCiphertext",
  "accessToken",
  "encrypted_secret_value",
  "plaintextSecret",
  "authorizationCode",
  "appSecret",
  "webhookVerifyToken"
]);

export const INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT =
  "id,tenant_id,channel_connection_id,provider,auth_family,credential_status,token_type,token_expires_at,refresh_eligible_at,last_refresh_at,last_refresh_status,last_refresh_error_code,granted_scopes,provider_instagram_account_id,provider_user_id,connected_by_sales_agent_id,connected_at,revoked_at,reauth_required_at,connection_health_status,credential_version,secret_fingerprint,created_at,updated_at";

export const INSTAGRAM_OAUTH_CREDENTIAL_INTERNAL_SELECT =
  `${INSTAGRAM_OAUTH_CREDENTIAL_METADATA_SELECT},access_token_ciphertext`;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapInstagramOAuthCredentialRow(row: CredentialRow): InstagramOAuthCredentialRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    channelConnectionId: row.channel_connection_id,
    provider: "INSTAGRAM",
    authFamily: row.auth_family as InstagramOAuthCredentialRecord["authFamily"],
    credentialStatus: row.credential_status as InstagramOAuthCredentialRecord["credentialStatus"],
    tokenType: row.token_type,
    tokenExpiresAt: parseDate(row.token_expires_at),
    refreshEligibleAt: parseDate(row.refresh_eligible_at),
    lastRefreshAt: parseDate(row.last_refresh_at),
    lastRefreshStatus: row.last_refresh_status as InstagramOAuthCredentialRecord["lastRefreshStatus"],
    lastRefreshErrorCode: row.last_refresh_error_code,
    grantedScopes: row.granted_scopes,
    providerInstagramAccountId: row.provider_instagram_account_id,
    providerUserId: row.provider_user_id,
    connectedBySalesAgentId: row.connected_by_sales_agent_id,
    connectedAt: parseDate(row.connected_at),
    revokedAt: parseDate(row.revoked_at),
    reauthRequiredAt: parseDate(row.reauth_required_at),
    connectionHealthStatus:
      row.connection_health_status as InstagramOAuthCredentialRecord["connectionHealthStatus"],
    credentialVersion: row.credential_version,
    secretFingerprint: row.secret_fingerprint,
    createdAt: parseDate(row.created_at) ?? new Date(0),
    updatedAt: parseDate(row.updated_at) ?? new Date(0)
  };
}

export function toInstagramOAuthCredentialMetadata(
  record: InstagramOAuthCredentialRecord
): InstagramOAuthCredentialMetadata {
  return {
    id: record.id,
    tenantId: record.tenantId,
    channelConnectionId: record.channelConnectionId,
    provider: record.provider,
    authFamily: record.authFamily,
    credentialStatus: record.credentialStatus,
    providerInstagramAccountId: record.providerInstagramAccountId,
    providerUserId: record.providerUserId,
    tokenExpiresAt: toIso(record.tokenExpiresAt),
    refreshEligibleAt: toIso(record.refreshEligibleAt),
    lastRefreshAt: toIso(record.lastRefreshAt),
    lastRefreshStatus: record.lastRefreshStatus,
    connectionHealthStatus: record.connectionHealthStatus,
    credentialVersion: record.credentialVersion,
    connectedAt: toIso(record.connectedAt),
    revokedAt: toIso(record.revokedAt),
    reauthRequiredAt: toIso(record.reauthRequiredAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function assertInstagramOAuthMetadataSelectSafe(columns: string): void {
  for (const blocked of BLOCKED_METADATA_KEYS) {
    if (columns.includes(blocked)) {
      throw new Error(`Instagram OAuth metadata select must not include ${blocked}`);
    }
  }
  if (columns.includes("access_token_ciphertext")) {
    throw new Error("Instagram OAuth metadata select must not include access_token_ciphertext");
  }
}
