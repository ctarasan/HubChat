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

/** ADMIN API response shape (Phase II-G2-A frozen spec). */
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
};

export type ChannelSettingListResponseDto = {
  data: ChannelSettingPublicDto[];
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
  providerPageId?: string | null;
  providerAccountName?: string | null;
  /** API canonical secret names; blank values are ignored. */
  secretsPatch?: Record<string, string>;
  /** API canonical names; normalized to storage keys in use case. */
  clearSecrets?: ApiSecretField[];
  /** Storage secret keys to clear (set by UpsertChannelSettingUseCase). */
  clearSecretKeys?: string[];
};

/** @deprecated G1 shape — retained for UI-local types only; API uses ChannelSettingPublicDto. */
export type SecretConfiguredMeta = {
  key: string;
  configured: boolean;
  fingerprint: string | null;
};

/** @deprecated G1 shape — API routes return ChannelSettingPublicDto. */
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
