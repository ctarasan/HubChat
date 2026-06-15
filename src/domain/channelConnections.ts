import type { SupportedChannelSettingChannel } from "./channelSettings.js";

/** Channel provider for Channel Connect Platform (same scope as channel_settings). */
export type ChannelConnectProvider = SupportedChannelSettingChannel;

export const CHANNEL_CONNECT_PROVIDERS: ChannelConnectProvider[] = ["LINE", "FACEBOOK", "INSTAGRAM"];

export function isChannelConnectProvider(value: string): value is ChannelConnectProvider {
  return (CHANNEL_CONNECT_PROVIDERS as string[]).includes(value);
}

export type ChannelConnectionStatus =
  | "DRAFT"
  | "AUTHORIZING"
  | "CONNECTED"
  | "WEBHOOK_CONFIGURED"
  | "WEBHOOK_VERIFIED"
  | "INBOUND_VERIFIED"
  | "OUTBOUND_VERIFIED"
  | "READY"
  | "ERROR"
  | "RECONNECT_REQUIRED"
  | "REVOKED";

export const CHANNEL_CONNECTION_STATUSES: ChannelConnectionStatus[] = [
  "DRAFT",
  "AUTHORIZING",
  "CONNECTED",
  "WEBHOOK_CONFIGURED",
  "WEBHOOK_VERIFIED",
  "INBOUND_VERIFIED",
  "OUTBOUND_VERIFIED",
  "READY",
  "ERROR",
  "RECONNECT_REQUIRED",
  "REVOKED"
];

export type ChannelCredentialState = "EMPTY" | "SET" | "EXPIRED" | "REVOKED";

export const CHANNEL_CREDENTIAL_STATES: ChannelCredentialState[] = ["EMPTY", "SET", "EXPIRED", "REVOKED"];

export type ChannelCredentialType =
  | "ACCESS_TOKEN"
  | "REFRESH_TOKEN"
  | "CHANNEL_SECRET"
  | "APP_SECRET"
  | "VERIFY_TOKEN";

export const CHANNEL_CREDENTIAL_TYPES: ChannelCredentialType[] = [
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "CHANNEL_SECRET",
  "APP_SECRET",
  "VERIFY_TOKEN"
];

/** Safe, non-secret error codes for connection health (no provider payloads). */
export type ChannelConnectionErrorCode =
  | "CONNECTION_NOT_FOUND"
  | "INVALID_PROVIDER"
  | "INVALID_STATUS"
  | "INVALID_PUBLIC_KEY"
  | "CREDENTIAL_NOT_FOUND"
  | "CREDENTIAL_ENCRYPTION_UNAVAILABLE"
  | "CREDENTIAL_DECRYPT_FAILED"
  | "TENANT_SCOPE_MISMATCH"
  | "WEBHOOK_NOT_CONFIGURED"
  | "PROVIDER_HEALTH_CHECK_FAILED"
  | "UNAUTHORIZED_TRANSITION";

export type ChannelConnectionRecord = {
  id: string;
  tenantId: string;
  provider: ChannelConnectProvider;
  status: ChannelConnectionStatus;
  providerAccountId: string | null;
  providerAccountName: string | null;
  providerPageId: string | null;
  providerIgAccountId: string | null;
  publicConnectionKey: string;
  webhookEndpoint: string | null;
  webhookActive: boolean;
  lastInboundVerifiedAt: Date | null;
  lastOutboundVerifiedAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessageSafe: string | null;
  connectedBy: string | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelCredentialRecord = {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: ChannelConnectProvider;
  credentialType: ChannelCredentialType;
  secretFingerprint: string | null;
  tokenExpiresAt: Date | null;
  credentialState: ChannelCredentialState;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateChannelConnectionInput = {
  tenantId: string;
  provider: ChannelConnectProvider;
  status?: ChannelConnectionStatus;
  providerAccountId?: string | null;
  providerAccountName?: string | null;
  providerPageId?: string | null;
  providerIgAccountId?: string | null;
  publicConnectionKey?: string;
  webhookEndpoint?: string | null;
  connectedBy?: string | null;
};

export type UpdateChannelConnectionLifecycleInput = {
  tenantId: string;
  connectionId: string;
  status: ChannelConnectionStatus;
  connectedAt?: Date | null;
  connectedBy?: string | null;
};

export type UpdateChannelConnectionProviderMetadataInput = {
  tenantId: string;
  connectionId: string;
  providerPageId?: string | null;
  providerAccountName?: string | null;
  providerAccountId?: string | null;
};

export type UpdateChannelConnectionWebhookInput = {
  tenantId: string;
  connectionId: string;
  webhookEndpoint?: string | null;
  webhookActive: boolean;
  status?: ChannelConnectionStatus;
};

export type UpdateChannelConnectHealthInput = {
  tenantId: string;
  connectionId: string;
  lastInboundVerifiedAt?: Date | null;
  lastOutboundVerifiedAt?: Date | null;
  lastHealthCheckAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessageSafe?: string | null;
  status?: ChannelConnectionStatus;
};

export type StoreChannelCredentialInput = {
  tenantId: string;
  connectionId: string;
  provider: ChannelConnectProvider;
  credentialType: ChannelCredentialType;
  plaintextSecret: string;
  tokenExpiresAt?: Date | null;
  credentialState?: ChannelCredentialState;
};

export type FindChannelConnectionByAccountInput = {
  tenantId: string;
  provider: ChannelConnectProvider;
  providerAccountId: string;
};

/** Public-safe connection summary for future Channel Connect APIs. */
export type ChannelConnectionPublicDto = {
  id: string;
  provider: ChannelConnectProvider;
  status: ChannelConnectionStatus;
  providerAccountId: string | null;
  providerAccountName: string | null;
  providerPageId: string | null;
  providerIgAccountId: string | null;
  publicConnectionKey: string;
  webhookEndpoint: string | null;
  webhookActive: boolean;
  lastInboundVerifiedAt: string | null;
  lastOutboundVerifiedAt: string | null;
  lastHealthCheckAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessageSafe: string | null;
  connectedAt: string | null;
  updatedAt: string;
  credentialStates: Partial<Record<ChannelCredentialType, ChannelCredentialState>>;
};

export type ChannelCredentialMetadataDto = {
  connectionId: string;
  provider: ChannelConnectProvider;
  credentialType: ChannelCredentialType;
  credentialState: ChannelCredentialState;
  secretFingerprint: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string;
};

/** Internal runtime-only decrypted credential (never HTTP/API). */
export type ChannelCredentialRuntimeSecret = {
  tenantId: string;
  connectionId: string;
  provider: ChannelConnectProvider;
  credentialType: ChannelCredentialType;
  plaintextSecret: string;
  tokenExpiresAt: Date | null;
};
