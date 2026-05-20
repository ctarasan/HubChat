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

/** Per-secret metadata exposed to ADMIN APIs (never raw values). */
export type SecretConfiguredMeta = {
  key: string;
  configured: boolean;
  fingerprint: string | null;
};

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

export type ChannelSettingListResponseDto = {
  data: ChannelSettingSafeDto[];
};

export type UpdateChannelSettingInput = {
  tenantId: string;
  channel: SupportedChannelSettingChannel;
  enabled?: boolean;
  displayName?: string | null;
  configJson?: Record<string, unknown>;
  /** Non-empty string values are stored; omitted keys unchanged. */
  secretsPatch?: Record<string, string>;
  clearSecretKeys?: string[];
};
