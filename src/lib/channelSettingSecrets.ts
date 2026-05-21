import { createHash } from "node:crypto";
import type { SecretConfiguredMeta, SupportedChannelSettingChannel } from "../domain/channelSettings.js";

export function mergeProviderConfigJson(
  existing: Record<string, unknown>,
  input: {
    providerPageId?: string | null;
    providerAccountName?: string | null;
  }
): Record<string, unknown> {
  const next = { ...existing };
  if (input.providerPageId !== undefined) {
    if (input.providerPageId === null) delete next.providerPageId;
    else next.providerPageId = input.providerPageId;
  }
  if (input.providerAccountName !== undefined) {
    if (input.providerAccountName === null) delete next.providerAccountName;
    else next.providerAccountName = input.providerAccountName;
  }
  return assertSafeConfigJson(next);
}
import { SUPPORTED_CHANNEL_SETTING_CHANNELS } from "../domain/channelSettings.js";

/** Allowed secret keys per channel (server-side storage only). */
export const CHANNEL_SETTING_SECRET_KEYS: Record<SupportedChannelSettingChannel, readonly string[]> = {
  LINE: ["channel_secret", "channel_access_token"],
  FACEBOOK: ["page_access_token", "app_secret", "verify_token"],
  INSTAGRAM: ["access_token", "verify_token", "app_secret"]
};

const BLOCKED_SECRET_KEYS = new Set([
  "rawWebhook",
  "providerPayload",
  "password",
  "authorization",
  "bearer"
]);

export function fingerprintSecretValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertSafeConfigJson(config: unknown): Record<string, unknown> {
  if (!isPlainObject(config)) {
    throw new Error("config_json must be a JSON object");
  }
  return config;
}

export function validateSecretsPatch(
  channel: SupportedChannelSettingChannel,
  patch: Record<string, string> | undefined,
  clearKeys: string[] | undefined
): void {
  const allowed = new Set(CHANNEL_SETTING_SECRET_KEYS[channel]);
  for (const key of clearKeys ?? []) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown secret key to clear: ${key}`);
    }
  }
  if (!patch) return;
  if (!isPlainObject(patch)) {
    throw new Error("secrets must be a JSON object");
  }
  for (const [key, value] of Object.entries(patch)) {
    if (BLOCKED_SECRET_KEYS.has(key)) {
      throw new Error(`Secret key not allowed: ${key}`);
    }
    if (!allowed.has(key)) {
      throw new Error(`Unknown secret key: ${key}`);
    }
    if (typeof value !== "string") {
      throw new Error(`Secret ${key} must be a string`);
    }
    if (value.trim().length === 0) {
      continue;
    }
  }
}

export function mergeChannelSecrets(
  channel: SupportedChannelSettingChannel,
  existingSecrets: Record<string, unknown>,
  secretsPatch: Record<string, string> | undefined,
  clearSecretKeys: string[] | undefined
): { secretJson: Record<string, string>; secretFingerprintJson: Record<string, string> } {
  validateSecretsPatch(channel, secretsPatch, clearSecretKeys);
  const allowed = CHANNEL_SETTING_SECRET_KEYS[channel];
  const next: Record<string, string> = {};
  for (const key of allowed) {
    const raw = existingSecrets[key];
    if (typeof raw === "string" && raw.length > 0) {
      next[key] = raw;
    }
  }
  for (const key of clearSecretKeys ?? []) {
    delete next[key];
  }
  for (const [key, value] of Object.entries(secretsPatch ?? {})) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      next[key] = trimmed;
    }
  }
  const secretFingerprintJson: Record<string, string> = {};
  for (const [key, value] of Object.entries(next)) {
    secretFingerprintJson[key] = fingerprintSecretValue(value);
  }
  return { secretJson: next, secretFingerprintJson };
}

export function buildSecretsConfiguredMeta(
  channel: SupportedChannelSettingChannel,
  secretFingerprintJson: Record<string, unknown>
): SecretConfiguredMeta[] {
  const allowed = CHANNEL_SETTING_SECRET_KEYS[channel];
  return allowed.map((key) => {
    const fp = secretFingerprintJson[key];
    const fingerprint = typeof fp === "string" && fp.length > 0 ? fp : null;
    return {
      key,
      configured: fingerprint !== null,
      fingerprint
    };
  });
}

/** Strip any accidental secret fields from API-facing objects. */
export function stripSecretFields<T extends Record<string, unknown>>(row: T): Omit<T, "secret_json" | "secretJson"> {
  const { secret_json: _a, secretJson: _b, ...rest } = row as T & { secret_json?: unknown; secretJson?: unknown };
  return rest;
}

export function parseChannelParam(value: string): SupportedChannelSettingChannel {
  const upper = value.toUpperCase();
  if (!SUPPORTED_CHANNEL_SETTING_CHANNELS.includes(upper as SupportedChannelSettingChannel)) {
    throw new Error("Unsupported channel");
  }
  return upper as SupportedChannelSettingChannel;
}
