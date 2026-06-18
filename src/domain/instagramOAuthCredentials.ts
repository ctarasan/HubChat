/** Instagram OAuth credential foundation — internal persistence model (IG-AUTH-2A). */

export type InstagramOAuthAuthFamily = "LEGACY_FACEBOOK_PAGE" | "INSTAGRAM_BUSINESS_LOGIN";

export const INSTAGRAM_OAUTH_AUTH_FAMILIES: InstagramOAuthAuthFamily[] = [
  "LEGACY_FACEBOOK_PAGE",
  "INSTAGRAM_BUSINESS_LOGIN"
];

export type InstagramOAuthCredentialStatus =
  | "PENDING"
  | "ACTIVE"
  | "TOKEN_EXPIRING"
  | "REFRESHING"
  | "REAUTH_REQUIRED"
  | "REVOKED"
  | "DISCONNECTED"
  | "ERROR";

export const INSTAGRAM_OAUTH_CREDENTIAL_STATUSES: InstagramOAuthCredentialStatus[] = [
  "PENDING",
  "ACTIVE",
  "TOKEN_EXPIRING",
  "REFRESHING",
  "REAUTH_REQUIRED",
  "REVOKED",
  "DISCONNECTED",
  "ERROR"
];

/** Non-terminal statuses eligible for active lookup and partial unique indexes. */
export const INSTAGRAM_OAUTH_ACTIVE_CREDENTIAL_STATUSES: InstagramOAuthCredentialStatus[] = [
  "PENDING",
  "ACTIVE",
  "TOKEN_EXPIRING",
  "REFRESHING",
  "REAUTH_REQUIRED"
];

export type InstagramOAuthRefreshStatus =
  | "NEVER"
  | "SUCCESS"
  | "RETRYABLE_FAILURE"
  | "TERMINAL_FAILURE";

export const INSTAGRAM_OAUTH_REFRESH_STATUSES: InstagramOAuthRefreshStatus[] = [
  "NEVER",
  "SUCCESS",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE"
];

export type InstagramOAuthConnectionHealthStatus =
  | "UNKNOWN"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY";

export const INSTAGRAM_OAUTH_CONNECTION_HEALTH_STATUSES: InstagramOAuthConnectionHealthStatus[] = [
  "UNKNOWN",
  "HEALTHY",
  "DEGRADED",
  "UNHEALTHY"
];

export type InstagramOAuthCredentialRecord = {
  id: string;
  tenantId: string;
  channelConnectionId: string;
  provider: "INSTAGRAM";
  authFamily: InstagramOAuthAuthFamily;
  credentialStatus: InstagramOAuthCredentialStatus;
  tokenType: string;
  tokenExpiresAt: Date | null;
  refreshEligibleAt: Date | null;
  lastRefreshAt: Date | null;
  lastRefreshStatus: InstagramOAuthRefreshStatus;
  lastRefreshErrorCode: string | null;
  grantedScopes: string[] | null;
  providerInstagramAccountId: string | null;
  providerUserId: string | null;
  connectedBySalesAgentId: string | null;
  connectedAt: Date | null;
  revokedAt: Date | null;
  reauthRequiredAt: Date | null;
  connectionHealthStatus: InstagramOAuthConnectionHealthStatus;
  credentialVersion: number;
  secretFingerprint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Sanitized metadata — safe for internal service layers; never includes ciphertext or tokens. */
export type InstagramOAuthCredentialMetadata = {
  id: string;
  tenantId: string;
  channelConnectionId: string;
  provider: "INSTAGRAM";
  authFamily: InstagramOAuthAuthFamily;
  credentialStatus: InstagramOAuthCredentialStatus;
  providerInstagramAccountId: string | null;
  providerUserId: string | null;
  tokenExpiresAt: string | null;
  refreshEligibleAt: string | null;
  lastRefreshAt: string | null;
  lastRefreshStatus: InstagramOAuthRefreshStatus;
  connectionHealthStatus: InstagramOAuthConnectionHealthStatus;
  credentialVersion: number;
  connectedAt: string | null;
  revokedAt: string | null;
  reauthRequiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Runtime-only decrypted access token material — never HTTP/API DTO. */
export type InstagramOAuthCredentialMaterial = {
  tenantId: string;
  channelConnectionId: string;
  credentialId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  credentialVersion: number;
};

export type CreateInstagramOAuthPendingCredentialInput = {
  tenantId: string;
  channelConnectionId: string;
  authFamily: InstagramOAuthAuthFamily;
  connectedBySalesAgentId?: string | null;
  grantedScopes?: string[] | null;
};

export type ActivateInstagramOAuthCredentialInput = {
  tenantId: string;
  channelConnectionId: string;
  credentialId: string;
  accessToken: string;
  tokenExpiresAt: Date;
  refreshEligibleAt: Date;
  providerInstagramAccountId: string;
  providerUserId?: string | null;
  grantedScopes?: string[] | null;
  connectedBySalesAgentId?: string | null;
};

export type InstagramOAuthCredentialLookupInput = {
  tenantId: string;
  channelConnectionId: string;
};

/** Optimistic concurrency guard for lifecycle mutations. */
export type InstagramOAuthCredentialMutationGuard = {
  tenantId: string;
  channelConnectionId: string;
  credentialId: string;
  expectedCredentialVersion: number;
  expectedCurrentStatus: InstagramOAuthCredentialStatus;
};

export type UpdateInstagramOAuthLifecycleInput = InstagramOAuthCredentialMutationGuard & {
  credentialStatus: InstagramOAuthCredentialStatus;
  connectionHealthStatus?: InstagramOAuthConnectionHealthStatus;
  lastRefreshStatus?: InstagramOAuthRefreshStatus;
  lastRefreshErrorCode?: string | null;
  tokenExpiresAt?: Date | null;
  refreshEligibleAt?: Date | null;
  reauthRequiredAt?: Date | null;
  revokedAt?: Date | null;
};

export type ReplaceInstagramOAuthAccessTokenInput = InstagramOAuthCredentialMutationGuard & {
  accessToken: string;
  tokenExpiresAt: Date;
  refreshEligibleAt?: Date | null;
  lastRefreshStatus: InstagramOAuthRefreshStatus;
  lastRefreshErrorCode?: string | null;
  credentialStatus?: InstagramOAuthCredentialStatus;
};

export type MarkInstagramOAuthReauthRequiredInput = InstagramOAuthCredentialMutationGuard & {
  errorCode?: string | null;
};

export type MarkInstagramOAuthRevokedInput = InstagramOAuthCredentialMutationGuard;

export type DisconnectInstagramOAuthCredentialInput = InstagramOAuthCredentialMutationGuard;
