import type {
  ApiSecretField,
  SupportedChannelSettingChannel
} from "../domain/channelSettings.js";

/** Maps frozen API secret field names to persisted storage keys per channel. */
export const API_SECRET_TO_STORAGE: Record<
  SupportedChannelSettingChannel,
  Partial<Record<ApiSecretField, string>>
> = {
  LINE: {
    accessToken: "channel_access_token",
    channelSecret: "channel_secret"
  },
  FACEBOOK: {
    accessToken: "page_access_token",
    verifyToken: "verify_token",
    appSecret: "app_secret"
  },
  INSTAGRAM: {
    accessToken: "access_token",
    verifyToken: "verify_token",
    appSecret: "app_secret"
  }
};

const BLOCKED_SECRET_KEYS = new Set([
  "rawWebhook",
  "providerPayload",
  "password",
  "authorization",
  "bearer"
]);

export function apiSecretFieldsForChannel(channel: SupportedChannelSettingChannel): ApiSecretField[] {
  return Object.keys(API_SECRET_TO_STORAGE[channel]) as ApiSecretField[];
}

export function storageKeyForApiSecret(
  channel: SupportedChannelSettingChannel,
  apiField: ApiSecretField
): string | undefined {
  return API_SECRET_TO_STORAGE[channel][apiField];
}

export function apiFieldForStorageKey(
  channel: SupportedChannelSettingChannel,
  storageKey: string
): ApiSecretField | undefined {
  const entries = Object.entries(API_SECRET_TO_STORAGE[channel]) as [ApiSecretField, string][];
  return entries.find(([, storage]) => storage === storageKey)?.[0];
}

/** Drops blank/whitespace-only secret values so PATCH leaves existing secrets unchanged. */
export function filterNonBlankSecretsPatch(
  patch: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!patch) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string" && value.trim().length > 0) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

export function normalizeApiSecretsPatch(
  channel: SupportedChannelSettingChannel,
  apiPatch: Record<string, string> | undefined
): Record<string, string> | undefined {
  const filtered = filterNonBlankSecretsPatch(apiPatch);
  if (!filtered) return undefined;

  const allowedApi = new Set(apiSecretFieldsForChannel(channel));
  const storagePatch: Record<string, string> = {};

  for (const [key, value] of Object.entries(filtered)) {
    if (BLOCKED_SECRET_KEYS.has(key)) {
      throw new Error(`Secret key not allowed: ${key}`);
    }
    if (!allowedApi.has(key as ApiSecretField)) {
      throw new Error(`Unknown secret key: ${key}`);
    }
    const storageKey = storageKeyForApiSecret(channel, key as ApiSecretField);
    if (!storageKey) {
      throw new Error(`Unknown secret key: ${key}`);
    }
    storagePatch[storageKey] = value.trim();
  }

  return Object.keys(storagePatch).length > 0 ? storagePatch : undefined;
}

export function normalizeApiClearSecrets(
  channel: SupportedChannelSettingChannel,
  clearSecrets: ApiSecretField[] | undefined
): string[] | undefined {
  if (!clearSecrets?.length) return undefined;

  const allowedApi = new Set(apiSecretFieldsForChannel(channel));
  const storageKeys: string[] = [];

  for (const apiField of clearSecrets) {
    if (!allowedApi.has(apiField)) {
      throw new Error(`Unknown secret key to clear: ${apiField}`);
    }
    const storageKey = storageKeyForApiSecret(channel, apiField);
    if (!storageKey) {
      throw new Error(`Unknown secret key to clear: ${apiField}`);
    }
    storageKeys.push(storageKey);
  }

  return storageKeys;
}
