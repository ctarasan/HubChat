import type {
  ChannelConnectionPublicDto,
  ChannelConnectionRecord,
  ChannelCredentialMetadataDto,
  ChannelCredentialRecord,
  ChannelCredentialState,
  ChannelCredentialType
} from "../domain/channelConnections.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

type ConnectionRow = {
  id: string;
  tenant_id: string;
  provider: string;
  status: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  provider_page_id: string | null;
  provider_ig_account_id: string | null;
  public_connection_key: string;
  webhook_endpoint: string | null;
  webhook_active: boolean;
  last_inbound_verified_at: string | null;
  last_outbound_verified_at: string | null;
  last_health_check_at: string | null;
  last_error_code: string | null;
  last_error_message_safe: string | null;
  connected_by: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

type CredentialRow = {
  id: string;
  tenant_id: string;
  connection_id: string;
  provider: string;
  credential_type: string;
  secret_fingerprint: string | null;
  token_expires_at: string | null;
  credential_state: string;
  created_at: string;
  updated_at: string;
};

const BLOCKED_PUBLIC_KEYS = new Set([
  "encrypted_secret_value",
  "encryptedSecretValue",
  "plaintextSecret",
  "secret_json",
  "access_token",
  "refresh_token",
  "channel_secret",
  "app_secret",
  "verify_token"
]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapChannelConnectionRow(row: ConnectionRow): ChannelConnectionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider as ChannelConnectionRecord["provider"],
    status: row.status as ChannelConnectionRecord["status"],
    providerAccountId: row.provider_account_id,
    providerAccountName: row.provider_account_name,
    providerPageId: row.provider_page_id,
    providerIgAccountId: row.provider_ig_account_id,
    publicConnectionKey: row.public_connection_key,
    webhookEndpoint: row.webhook_endpoint,
    webhookActive: Boolean(row.webhook_active),
    lastInboundVerifiedAt: parseDate(row.last_inbound_verified_at),
    lastOutboundVerifiedAt: parseDate(row.last_outbound_verified_at),
    lastHealthCheckAt: parseDate(row.last_health_check_at),
    lastErrorCode: row.last_error_code,
    lastErrorMessageSafe: row.last_error_message_safe,
    connectedBy: row.connected_by,
    connectedAt: parseDate(row.connected_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export function mapChannelCredentialMetadataRow(row: CredentialRow): ChannelCredentialRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    provider: row.provider as ChannelCredentialRecord["provider"],
    credentialType: row.credential_type as ChannelCredentialRecord["credentialType"],
    secretFingerprint: row.secret_fingerprint,
    tokenExpiresAt: parseDate(row.token_expires_at),
    credentialState: row.credential_state as ChannelCredentialRecord["credentialState"],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export function toChannelCredentialMetadataDto(row: ChannelCredentialRecord): ChannelCredentialMetadataDto {
  return {
    connectionId: row.connectionId,
    provider: row.provider,
    credentialType: row.credentialType,
    credentialState: row.credentialState,
    secretFingerprint: row.secretFingerprint,
    tokenExpiresAt: toIso(row.tokenExpiresAt),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function buildCredentialStateBadgesFromMetadata(
  credentials: ChannelCredentialMetadataDto[]
): Partial<Record<ChannelCredentialType, ChannelCredentialState>> {
  const badges: Partial<Record<ChannelCredentialType, ChannelCredentialState>> = {};
  for (const item of credentials) {
    badges[item.credentialType] = item.credentialState;
  }
  return badges;
}

export function buildCredentialStateBadges(
  credentials: ChannelCredentialRecord[]
): Partial<Record<ChannelCredentialType, ChannelCredentialState>> {
  const badges: Partial<Record<ChannelCredentialType, ChannelCredentialState>> = {};
  for (const item of credentials) {
    badges[item.credentialType] = item.credentialState;
  }
  return badges;
}

export function toChannelConnectionPublicDto(input: {
  connection: ChannelConnectionRecord;
  credentials?: ChannelCredentialRecord[];
  credentialMetadata?: ChannelCredentialMetadataDto[];
}): ChannelConnectionPublicDto {
  const { connection } = input;
  const credentialStates =
    input.credentialMetadata !== undefined
      ? buildCredentialStateBadgesFromMetadata(input.credentialMetadata)
      : buildCredentialStateBadges(input.credentials ?? []);
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    providerAccountId: connection.providerAccountId,
    providerAccountName: connection.providerAccountName,
    providerPageId: connection.providerPageId,
    providerIgAccountId: connection.providerIgAccountId,
    publicConnectionKey: connection.publicConnectionKey,
    webhookEndpoint: connection.webhookEndpoint,
    webhookActive: connection.webhookActive,
    lastInboundVerifiedAt: toIso(connection.lastInboundVerifiedAt),
    lastOutboundVerifiedAt: toIso(connection.lastOutboundVerifiedAt),
    lastHealthCheckAt: toIso(connection.lastHealthCheckAt),
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessageSafe: connection.lastErrorMessageSafe,
    connectedAt: toIso(connection.connectedAt),
    updatedAt: connection.updatedAt.toISOString(),
    credentialStates
  };
}

export function sanitizeChannelConnectionErrorMessage(raw: unknown): string {
  return sanitizeProviderErrorMessage(raw);
}

export function assertPublicConnectionDtoSafe(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (BLOCKED_PUBLIC_KEYS.has(key)) {
      throw new Error("Public connection DTO contains forbidden field");
    }
  }
}

export const CHANNEL_CONNECTION_PUBLIC_SELECT =
  "id,tenant_id,provider,status,provider_account_id,provider_account_name,provider_page_id,provider_ig_account_id,public_connection_key,webhook_endpoint,webhook_active,last_inbound_verified_at,last_outbound_verified_at,last_health_check_at,last_error_code,last_error_message_safe,connected_by,connected_at,created_at,updated_at";

export const CHANNEL_CREDENTIAL_METADATA_SELECT =
  "id,tenant_id,connection_id,provider,credential_type,secret_fingerprint,token_expires_at,credential_state,created_at,updated_at";

export const CHANNEL_CREDENTIAL_INTERNAL_SELECT = `${CHANNEL_CREDENTIAL_METADATA_SELECT},encrypted_secret_value`;
