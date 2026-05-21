import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

export type LineRuntimeConfigMode = "ENV_ONLY" | "DB_WITH_ENV_FALLBACK" | "DB_ONLY";

export type LineOutboundCredentials = {
  channelAccessToken: string;
  channelSecret: string;
};

export type LineOutboundConfigSource = "env" | "db";

export type LineOutboundFallbackReason =
  | "disabled"
  | "not_configured"
  | "error_state"
  | "unavailable";

export type ResolvedLineOutboundConfig = {
  source: LineOutboundConfigSource;
  credentials: LineOutboundCredentials;
  fallbackReason?: LineOutboundFallbackReason;
};

export type LineEnvInput = {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
};

export function parseLineRuntimeConfigMode(raw: string | undefined): LineRuntimeConfigMode {
  const normalized = (raw ?? "ENV_ONLY").trim().toUpperCase();
  if (normalized === "DB_WITH_ENV_FALLBACK") return "DB_WITH_ENV_FALLBACK";
  if (normalized === "DB_ONLY") return "DB_ONLY";
  return "ENV_ONLY";
}

export function loadEnvLineCredentials(env: LineEnvInput): LineOutboundCredentials | null {
  const channelAccessToken = env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
  const channelSecret = env.LINE_CHANNEL_SECRET?.trim() ?? "";
  if (!channelAccessToken || !channelSecret) return null;
  return { channelAccessToken, channelSecret };
}

export function lineCredentialsFromRuntimeConfig(
  runtime: ChannelRuntimeConfig
): LineOutboundCredentials | null {
  const channelAccessToken = runtime.secrets.accessToken?.trim() ?? "";
  const channelSecret = runtime.secrets.channelSecret?.trim() ?? "";
  if (!channelAccessToken || !channelSecret) return null;
  return { channelAccessToken, channelSecret };
}

export function classifyLineDbRuntimeFallbackReason(
  setting: ChannelSettingPublicDto | null
): LineOutboundFallbackReason {
  if (!setting) return "not_configured";
  if (!setting.enabled) return "disabled";
  if (!setting.configured) return "not_configured";
  if (setting.status === "ERROR") return "error_state";
  return "unavailable";
}

export function buildLineRuntimeConfigUnavailableError(mode: LineRuntimeConfigMode): Error {
  const message =
    mode === "DB_ONLY"
      ? "LINE outbound is not configured in channel settings."
      : "LINE outbound runtime config is unavailable.";
  const err = new Error(sanitizeProviderErrorMessage(message));
  err.name = "LineOutboundRuntimeConfigError";
  return err;
}

export async function resolveLineOutboundConfig(input: {
  mode: LineRuntimeConfigMode;
  tenantId: string;
  env: LineEnvInput;
  getRuntimeConfig: (tenantId: string) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
}): Promise<ResolvedLineOutboundConfig> {
  const envCredentials = loadEnvLineCredentials(input.env);

  if (input.mode === "ENV_ONLY") {
    if (!envCredentials) throw buildLineRuntimeConfigUnavailableError(input.mode);
    return { source: "env", credentials: envCredentials };
  }

  const dbRuntime = await input.getRuntimeConfig(input.tenantId);
  const dbCredentials = dbRuntime ? lineCredentialsFromRuntimeConfig(dbRuntime) : null;

  if (input.mode === "DB_ONLY") {
    if (!dbCredentials) throw buildLineRuntimeConfigUnavailableError(input.mode);
    return { source: "db", credentials: dbCredentials };
  }

  if (dbCredentials) {
    return { source: "db", credentials: dbCredentials };
  }

  if (!envCredentials) {
    throw buildLineRuntimeConfigUnavailableError(input.mode);
  }

  const setting = input.findChannelSetting ? await input.findChannelSetting(input.tenantId) : null;
  return {
    source: "env",
    credentials: envCredentials,
    fallbackReason: classifyLineDbRuntimeFallbackReason(setting)
  };
}
