import type {
  MetaPageCredentialBindingMetadata,
  MetaPageCredentialBindingRecord,
  MetaPageCredentialMetadata,
  MetaPageCredentialRecord
} from "../domain/metaPageCredentials.js";

type CredentialRow = {
  id: string;
  tenant_id: string;
  credential_family: string;
  provider_app_id: string;
  facebook_page_id: string;
  instagram_professional_account_id: string | null;
  encrypted_access_token: string;
  token_fingerprint: string;
  encryption_format_version: string;
  key_version: number;
  credential_version: number;
  status: string;
  verified_at: string | null;
  last_verified_at: string | null;
  last_error_sanitized: string | null;
  created_at: string;
  updated_at: string;
};

type BindingRow = {
  id: string;
  tenant_id: string;
  credential_id: string;
  channel_connection_id: string;
  channel_type: string;
  binding_status: string;
  credential_version: number;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

const BLOCKED_METADATA_KEYS = new Set([
  "encrypted_access_token",
  "encryptedAccessToken",
  "accessToken",
  "access_token",
  "plaintextSecret",
  "authorizationCode",
  "appSecret"
]);

export const META_PAGE_CREDENTIAL_METADATA_SELECT =
  "id,tenant_id,credential_family,provider_app_id,facebook_page_id,instagram_professional_account_id,token_fingerprint,encryption_format_version,key_version,credential_version,status,verified_at,last_verified_at,last_error_sanitized,created_at,updated_at";

export const META_PAGE_CREDENTIAL_INTERNAL_SELECT =
  `${META_PAGE_CREDENTIAL_METADATA_SELECT},encrypted_access_token`;

export const META_PAGE_BINDING_METADATA_SELECT =
  "id,tenant_id,credential_id,channel_connection_id,channel_type,binding_status,credential_version,activated_at,created_at,updated_at";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapMetaPageCredentialRow(row: CredentialRow): MetaPageCredentialRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    credentialFamily: row.credential_family as MetaPageCredentialRecord["credentialFamily"],
    providerAppId: row.provider_app_id,
    facebookPageId: row.facebook_page_id,
    instagramProfessionalAccountId: row.instagram_professional_account_id,
    encryptedAccessToken: row.encrypted_access_token,
    tokenFingerprint: row.token_fingerprint,
    encryptionFormatVersion: row.encryption_format_version,
    keyVersion: row.key_version,
    credentialVersion: row.credential_version,
    status: row.status as MetaPageCredentialRecord["status"],
    verifiedAt: parseDate(row.verified_at),
    lastVerifiedAt: parseDate(row.last_verified_at),
    lastErrorSanitized: row.last_error_sanitized,
    createdAt: parseDate(row.created_at) ?? new Date(0),
    updatedAt: parseDate(row.updated_at) ?? new Date(0)
  };
}

export function toMetaPageCredentialMetadata(
  record: MetaPageCredentialRecord
): MetaPageCredentialMetadata {
  return {
    id: record.id,
    tenantId: record.tenantId,
    credentialFamily: record.credentialFamily,
    providerAppId: record.providerAppId,
    facebookPageId: record.facebookPageId,
    instagramProfessionalAccountId: record.instagramProfessionalAccountId,
    tokenFingerprint: record.tokenFingerprint,
    encryptionFormatVersion: record.encryptionFormatVersion,
    keyVersion: record.keyVersion,
    credentialVersion: record.credentialVersion,
    status: record.status,
    verifiedAt: toIso(record.verifiedAt),
    lastVerifiedAt: toIso(record.lastVerifiedAt),
    lastErrorSanitized: record.lastErrorSanitized,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapMetaPageBindingRow(row: BindingRow): MetaPageCredentialBindingRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    credentialId: row.credential_id,
    channelConnectionId: row.channel_connection_id,
    channelType: row.channel_type as MetaPageCredentialBindingRecord["channelType"],
    bindingStatus: row.binding_status as MetaPageCredentialBindingRecord["bindingStatus"],
    credentialVersion: row.credential_version,
    activatedAt: parseDate(row.activated_at),
    createdAt: parseDate(row.created_at) ?? new Date(0),
    updatedAt: parseDate(row.updated_at) ?? new Date(0)
  };
}

export function toMetaPageBindingMetadata(
  record: MetaPageCredentialBindingRecord
): MetaPageCredentialBindingMetadata {
  return {
    id: record.id,
    tenantId: record.tenantId,
    credentialId: record.credentialId,
    channelConnectionId: record.channelConnectionId,
    channelType: record.channelType,
    bindingStatus: record.bindingStatus,
    credentialVersion: record.credentialVersion,
    activatedAt: toIso(record.activatedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/** Ensure API-facing serialization never leaks ciphertext or tokens. */
export function assertMetaPageCredentialMetadataSafeForApi(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_METADATA_KEYS.has(key)) {
      throw new Error(`Meta Page credential metadata contains blocked secret field: ${key}`);
    }
    if (nested && typeof nested === "object") {
      assertMetaPageCredentialMetadataSafeForApi(nested);
    }
  }
}
