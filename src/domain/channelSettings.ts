/** Channels supported for DB-managed settings in Phase II-G1 (subset of channel_type). */
export type SupportedChannelSettingChannel = "LINE" | "FACEBOOK" | "INSTAGRAM";

export const SUPPORTED_CHANNEL_SETTING_CHANNELS: SupportedChannelSettingChannel[] = [
  "LINE",
  "FACEBOOK",
  "INSTAGRAM"
];

export function isSupportedChannelSettingChannel(value: string): value is SupportedChannelSettingChannel {
  return (SUPPORTED_CHANNEL_SETTING_CHANNELS as string[]).includes(value);
}

/** Frozen API secret field names (never returned as raw values). */
export type ApiSecretField = "accessToken" | "channelSecret" | "verifyToken" | "appSecret";

export type SecretStateValue = "EMPTY" | "SET";

export type ChannelSettingStatus = "NOT_CONFIGURED" | "DISABLED" | "READY" | "ERROR";

export type ChannelSettingSecretState = {
  accessToken: SecretStateValue;
  channelSecret?: SecretStateValue;
  verifyToken?: SecretStateValue;
  appSecret?: SecretStateValue;
};

/** Per-secret metadata for transitional G1 UI compatibility (fingerprints only). */
export type SecretConfiguredMeta = {
  key: string;
  configured: boolean;
  fingerprint: string | null;
};

/** ADMIN API response shape (Phase II-G2-A + transitional G1 safe fields). */
export type ChannelSettingPublicDto = {
  channel: SupportedChannelSettingChannel;
  enabled: boolean;
  configured: boolean;
  status: ChannelSettingStatus;
  providerPageId: string | null;
  providerAccountName: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
  secretState: ChannelSettingSecretState;
  /** Transitional: mirrors display_name / providerAccountName; never contains secrets. */
  displayName: string | null;
  /** Transitional: sanitized config_json; never contains raw secrets. */
  configJson: Record<string, unknown>;
  /** Transitional: storage-key metadata with fingerprints only. */
  secretsConfigured: SecretConfiguredMeta[];
};

export type ChannelSettingListResponseDto = {
  data: ChannelSettingPublicDto[];
};

/** POST /api/channel-settings/[channel]/test-connection response. */
export type ChannelTestConnectionResponseDto = {
  channel: SupportedChannelSettingChannel;
  ok: boolean;
  status: ChannelSettingStatus;
  message: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

export type UpdateChannelConnectionHealthInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  providerPageId?: string | null;
  providerAccountName?: string | null;
};

/** Server/worker-only runtime config (never exposed via HTTP API). */
export type ChannelRuntimeConfig = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
  enabled: true;
  providerPageId: string | null;
  providerAccountName: string | null;
  secrets: {
    accessToken: string;
    channelSecret?: string;
    verifyToken?: string;
    appSecret?: string;
  };
};

export type UpdateChannelSettingInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
  enabled?: boolean;
  displayName?: string | null;
  configJson?: Record<string, unknown>;
  providerPageId?: string | null;
  providerAccountName?: string | null;
  /** API canonical or legacy storage secret names; blank values are ignored. */
  secretsPatch?: Record<string, string>;
  /** API canonical names; normalized to storage keys in use case. */
  clearSecrets?: ApiSecretField[];
  /** Legacy G1 storage secret keys to clear (e.g. channel_secret). */
  legacyClearSecretKeys?: string[];
  /** Storage secret keys to clear (set by UpsertChannelSettingUseCase). */
  clearSecretKeys?: string[];
};

/** @deprecated G1 shape — UI-local; API returns ChannelSettingPublicDto with legacy fields. */
export type ChannelSettingSafeDto = {
  id: string;
  tenantId: string;
  channel: SupportedChannelSettingChannel;
  enabled: boolean;
  displayName: string | null;
  configJson: Record<string, unknown>;
  secretsConfigured: SecretConfiguredMeta[];
  createdAt: string;
  updatedAt: string;
};
