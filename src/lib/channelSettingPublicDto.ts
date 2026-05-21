import type {
  ApiSecretField,
  ChannelRuntimeConfig,
  ChannelSettingPublicDto,
  ChannelSettingSecretState,
  ChannelSettingStatus,
  SecretStateValue,
  SupportedChannelSettingChannel
} from "../domain/channelSettings.js";
import { apiSecretFieldsForChannel, storageKeyForApiSecret } from "./channelSettingApiSecrets.js";
import { assertSafeConfigJson } from "./channelSettingSecrets.js";

type InternalRow = {
  channel: string;
  enabled: boolean;
  display_name: string | null;
  config_json: Record<string, unknown>;
  secret_fingerprint_json: Record<string, unknown>;
  secret_json?: Record<string, unknown>;
  updated_at: string;
};

function readString(config: Record<string, unknown>, key: string): string | null {
  const v = config[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function secretStateValue(fingerprints: Record<string, unknown>, storageKey: string): SecretStateValue {
  const fp = fingerprints[storageKey];
  return typeof fp === "string" && fp.length > 0 ? "SET" : "EMPTY";
}

export function buildSecretState(
  channel: SupportedChannelSettingChannel,
  secretFingerprintJson: Record<string, unknown>
): ChannelSettingSecretState {
  const state: ChannelSettingSecretState = {
    accessToken: "EMPTY"
  };

  for (const apiField of apiSecretFieldsForChannel(channel)) {
    const storageKey = storageKeyForApiSecret(channel, apiField);
    if (!storageKey) continue;
    const value = secretStateValue(secretFingerprintJson, storageKey);
    if (apiField === "accessToken") {
      state.accessToken = value;
    } else {
      state[apiField] = value;
    }
  }

  return state;
}

export function isChannelConfigured(
  channel: SupportedChannelSettingChannel,
  secretState: ChannelSettingSecretState
): boolean {
  const required: ApiSecretField[] =
    channel === "LINE"
      ? ["accessToken", "channelSecret"]
      : ["accessToken", "appSecret", "verifyToken"];

  return required.every((field) => secretState[field] === "SET");
}

export function resolveChannelStatus(
  enabled: boolean,
  configured: boolean,
  lastError: string | null
): ChannelSettingStatus {
  if (!enabled) return "DISABLED";
  if (lastError) return "ERROR";
  if (!configured) return "NOT_CONFIGURED";
  return "READY";
}

export function toChannelSettingPublicDto(row: InternalRow): ChannelSettingPublicDto {
  const channel = row.channel as SupportedChannelSettingChannel;
  const config = assertSafeConfigJson(row.config_json ?? {});
  const secretState = buildSecretState(channel, row.secret_fingerprint_json ?? {});
  const configured = isChannelConfigured(channel, secretState);
  const providerAccountName =
    readString(config, "providerAccountName") ?? (row.display_name?.length ? row.display_name : null);
  const lastError = readString(config, "lastError");

  return {
    channel,
    enabled: Boolean(row.enabled),
    configured,
    status: resolveChannelStatus(Boolean(row.enabled), configured, lastError),
    providerPageId: readString(config, "providerPageId"),
    providerAccountName,
    lastVerifiedAt: readString(config, "lastVerifiedAt"),
    lastError,
    updatedAt: new Date(row.updated_at).toISOString(),
    secretState
  };
}

export function resolveChannelRuntimeConfig(
  tenantId: string,
  row: InternalRow
): ChannelRuntimeConfig | null {
  const channel = row.channel as SupportedChannelSettingChannel;
  if (!row.enabled) return null;

  const publicDto = toChannelSettingPublicDto(row);
  if (!publicDto.configured || publicDto.status === "ERROR") {
    return null;
  }

  const secretsJson = row.secret_json ?? {};
  const secrets: ChannelRuntimeConfig["secrets"] = {
    accessToken: ""
  };

  for (const apiField of apiSecretFieldsForChannel(channel)) {
    const storageKey = storageKeyForApiSecret(channel, apiField);
    if (!storageKey) continue;
    const raw = secretsJson[storageKey];
    if (typeof raw !== "string" || raw.length === 0) {
      return null;
    }
    if (apiField === "accessToken") {
      secrets.accessToken = raw;
    } else {
      secrets[apiField] = raw;
    }
  }

  if (!secrets.accessToken) return null;

  return {
    tenantId,
    channel,
    enabled: true,
    providerPageId: publicDto.providerPageId,
    providerAccountName: publicDto.providerAccountName,
    secrets
  };
}

/** Extract runtime secrets using storage keys only (server-side). */
export function readRuntimeSecretsFromStorage(
  channel: SupportedChannelSettingChannel,
  secretJson: Record<string, unknown>
): ChannelRuntimeConfig["secrets"] | null {
  const secrets: ChannelRuntimeConfig["secrets"] = { accessToken: "" };

  for (const apiField of apiSecretFieldsForChannel(channel)) {
    const storageKey = storageKeyForApiSecret(channel, apiField);
    if (!storageKey) continue;
    const raw = secretJson[storageKey];
    if (typeof raw !== "string" || raw.length === 0) return null;
    if (apiField === "accessToken") {
      secrets.accessToken = raw;
    } else {
      secrets[apiField] = raw;
    }
  }

  return secrets.accessToken ? secrets : null;
}
