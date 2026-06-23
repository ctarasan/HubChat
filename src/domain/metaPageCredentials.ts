/** Shared Meta Page credential foundation — META_PAGE_FACEBOOK_LOGIN family only (META-CRED-1C). */

export type MetaPageCredentialFamily = "META_PAGE_FACEBOOK_LOGIN";

export const META_PAGE_CREDENTIAL_FAMILIES: MetaPageCredentialFamily[] = ["META_PAGE_FACEBOOK_LOGIN"];

export type MetaPageCredentialStatus = "PENDING" | "ACTIVE" | "ERROR" | "REVOKED";

export const META_PAGE_CREDENTIAL_STATUSES: MetaPageCredentialStatus[] = [
  "PENDING",
  "ACTIVE",
  "ERROR",
  "REVOKED"
];

export type MetaPageBindingStatus = "PENDING" | "ACTIVE" | "DISABLED" | "ERROR";

export const META_PAGE_BINDING_STATUSES: MetaPageBindingStatus[] = [
  "PENDING",
  "ACTIVE",
  "DISABLED",
  "ERROR"
];

export type MetaPageBindingChannelType = "FACEBOOK" | "INSTAGRAM";

export const META_PAGE_BINDING_CHANNEL_TYPES: MetaPageBindingChannelType[] = ["FACEBOOK", "INSTAGRAM"];

export type MetaPageCredentialRecord = {
  id: string;
  tenantId: string;
  credentialFamily: MetaPageCredentialFamily;
  providerAppId: string;
  facebookPageId: string;
  instagramProfessionalAccountId: string | null;
  encryptedAccessToken: string;
  tokenFingerprint: string;
  encryptionFormatVersion: string;
  keyVersion: number;
  credentialVersion: number;
  status: MetaPageCredentialStatus;
  verifiedAt: Date | null;
  lastVerifiedAt: Date | null;
  lastErrorSanitized: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Sanitized metadata — safe for internal service layers; never includes ciphertext or tokens. */
export type MetaPageCredentialMetadata = {
  id: string;
  tenantId: string;
  credentialFamily: MetaPageCredentialFamily;
  providerAppId: string;
  facebookPageId: string;
  instagramProfessionalAccountId: string | null;
  tokenFingerprint: string;
  encryptionFormatVersion: string;
  keyVersion: number;
  credentialVersion: number;
  status: MetaPageCredentialStatus;
  verifiedAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorSanitized: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaPageCredentialBindingRecord = {
  id: string;
  tenantId: string;
  credentialId: string;
  channelConnectionId: string;
  channelType: MetaPageBindingChannelType;
  bindingStatus: MetaPageBindingStatus;
  credentialVersion: number;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MetaPageCredentialBindingMetadata = {
  id: string;
  tenantId: string;
  credentialId: string;
  channelConnectionId: string;
  channelType: MetaPageBindingChannelType;
  bindingStatus: MetaPageBindingStatus;
  credentialVersion: number;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Runtime-only decrypted access token material — never HTTP/API DTO. */
export type MetaPageCredentialMaterial = {
  tenantId: string;
  credentialId: string;
  accessToken: string;
  credentialVersion: number;
  facebookPageId: string;
  instagramProfessionalAccountId: string | null;
};

export type CreateVerifiedMetaPageCredentialInput = {
  tenantId: string;
  credentialFamily: MetaPageCredentialFamily;
  providerAppId: string;
  facebookPageId: string;
  instagramProfessionalAccountId?: string | null;
  accessToken: string;
  verifiedAt: Date;
  lastVerifiedAt?: Date | null;
};

export type MetaPageCredentialLookupInput = {
  tenantId: string;
  credentialId: string;
};

export type MetaPageBindingLookupInput = {
  tenantId: string;
  channelConnectionId: string;
};

export type BindMetaPageChannelConnectionInput = {
  tenantId: string;
  credentialId: string;
  channelConnectionId: string;
  channelType: MetaPageBindingChannelType;
  expectedCredentialVersion: number;
};

export type RotateMetaPageCredentialInput = {
  tenantId: string;
  credentialId: string;
  accessToken: string;
  expectedCredentialVersion: number;
  expectedCurrentStatus: MetaPageCredentialStatus;
  lastVerifiedAt?: Date | null;
};

export type RevokeMetaPageCredentialInput = {
  tenantId: string;
  credentialId: string;
  expectedCredentialVersion: number;
  expectedCurrentStatus: MetaPageCredentialStatus;
  lastErrorSanitized?: string | null;
};
