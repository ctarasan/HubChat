import type {
  ChannelConnectProvider,
  ChannelConnectionRecord,
  ChannelConnectionStatus,
  ChannelCredentialType
} from "./channelConnections.js";

/** Aligns with existing HUBCHAT_*_RUNTIME_CONFIG_MODE values. */
export type ChannelConnectRuntimeMode = "ENV_ONLY" | "DB_WITH_ENV_FALLBACK" | "DB_ONLY";

export type ChannelConnectRuntimeConfigSource = "DB" | "ENV_FALLBACK" | "ENV_ONLY";

export type ChannelConnectResolverDiagnosticCode =
  | "db_credential_found"
  | "db_credential_missing"
  | "db_connection_missing"
  | "env_fallback_used"
  | "env_fallback_missing"
  | "db_only_missing_config"
  | "credential_decrypt_failed"
  | "credential_state_invalid"
  | "provider_account_mismatch"
  | "connection_status_invalid"
  | "resolver_disabled_legacy_env"
  | "encryption_key_missing"
  | "connection_not_found"
  | "ambiguous_channel_connection";

export type ChannelConnectResolverDiagnostics = {
  code: ChannelConnectResolverDiagnosticCode;
  provider: ChannelConnectProvider;
  mode: ChannelConnectRuntimeMode;
  connectionId?: string | null;
  connectionStatus?: ChannelConnectionStatus | null;
  fallbackReason?: string | null;
};

export type OutboundChannelCredentialSecrets = {
  accessToken?: string;
  channelSecret?: string;
  appSecret?: string;
  verifyToken?: string;
  refreshToken?: string;
};

/** Internal runtime-only outbound resolution result (never HTTP/public DTO). */
export type ResolvedOutboundChannelCredential = {
  provider: ChannelConnectProvider;
  configSource: ChannelConnectRuntimeConfigSource;
  connectionId: string | null;
  providerAccountId: string | null;
  providerPageId: string | null;
  providerIgAccountId: string | null;
  graphVersion: string | null;
  credentials: OutboundChannelCredentialSecrets;
  diagnostics: ChannelConnectResolverDiagnostics;
};

export type ResolveOutboundChannelCredentialInput = {
  provider: ChannelConnectProvider;
  tenantId: string;
  mode: ChannelConnectRuntimeMode;
  resolverEnabled: boolean;
  channelConnectionId?: string | null;
  providerAccountId?: string | null;
  providerPageId?: string | null;
  conversationId?: string | null;
};

export type ResolveInboundChannelConnectionInput = {
  provider: ChannelConnectProvider;
  tenantId?: string | null;
  publicConnectionKey?: string | null;
  providerAccountId?: string | null;
  providerPageId?: string | null;
  expectedProvider?: ChannelConnectProvider | null;
};

/** Internal inbound verification material (never HTTP/public DTO). */
export type ResolvedInboundChannelConnection = {
  tenantId: string;
  connectionId: string;
  provider: ChannelConnectProvider;
  publicConnectionKey: string;
  status: ChannelConnectionStatus;
  providerAccountId: string | null;
  providerPageId: string | null;
  providerIgAccountId: string | null;
  verificationMaterial: Pick<OutboundChannelCredentialSecrets, "channelSecret" | "appSecret" | "verifyToken">;
  diagnostics: ChannelConnectResolverDiagnostics;
};

export type ResolveCredentialMetadataForHealthInput = {
  tenantId: string;
  connectionId: string;
};

export const OUTBOUND_READY_CONNECTION_STATUSES: ChannelConnectionStatus[] = [
  "CONNECTED",
  "WEBHOOK_CONFIGURED",
  "WEBHOOK_VERIFIED",
  "INBOUND_VERIFIED",
  "OUTBOUND_VERIFIED",
  "READY"
];

export const INBOUND_BLOCKED_CONNECTION_STATUSES: ChannelConnectionStatus[] = ["REVOKED", "ERROR"];

export const PROVIDER_OUTBOUND_CREDENTIAL_TYPES: Record<
  ChannelConnectProvider,
  ChannelCredentialType[]
> = {
  LINE: ["ACCESS_TOKEN", "CHANNEL_SECRET"],
  FACEBOOK: ["ACCESS_TOKEN"],
  INSTAGRAM: ["ACCESS_TOKEN"]
};

export const PROVIDER_INBOUND_VERIFICATION_TYPES: Record<
  ChannelConnectProvider,
  ChannelCredentialType[]
> = {
  LINE: ["CHANNEL_SECRET"],
  FACEBOOK: ["APP_SECRET"],
  INSTAGRAM: ["APP_SECRET"]
};

export type ChannelConnectionLookupContext = Pick<
  ChannelConnectionRecord,
  "id" | "tenantId" | "provider" | "status" | "providerAccountId" | "providerPageId" | "providerIgAccountId" | "publicConnectionKey"
>;
