import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

export type InstagramRuntimeConfigMode = "ENV_ONLY" | "DB_WITH_ENV_FALLBACK" | "DB_ONLY";

export type InstagramOutboundCredentials = {
  accessToken: string;
  graphVersion: string;
  pageId: string;
  businessAccountId?: string;
};

export type InstagramOutboundConfigSource = "env" | "db";

export type InstagramOutboundFallbackReason =
  | "disabled"
  | "not_configured"
  | "error_state"
  | "unavailable";

export type ResolvedInstagramOutboundConfig = {
  source: InstagramOutboundConfigSource;
  credentials: InstagramOutboundCredentials;
  fallbackReason?: InstagramOutboundFallbackReason;
};

export type InstagramEnvInput = {
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  FACEBOOK_PAGE_ID?: string;
  INSTAGRAM_PAGE_ID?: string;
  META_GRAPH_VERSION?: string;
  FACEBOOK_GRAPH_VERSION?: string;
  INSTAGRAM_ACCOUNT_ID?: string;
};

const DEFAULT_GRAPH_VERSION = "v25.0";

export function normalizeInstagramGraphVersion(env: InstagramEnvInput): string {
  const raw = (env.META_GRAPH_VERSION ?? env.FACEBOOK_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return raw.startsWith("v") ? raw : `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export function parseInstagramRuntimeConfigMode(raw: string | undefined): InstagramRuntimeConfigMode {
  const normalized = (raw ?? "ENV_ONLY").trim().toUpperCase();
  if (normalized === "DB_WITH_ENV_FALLBACK") return "DB_WITH_ENV_FALLBACK";
  if (normalized === "DB_ONLY") return "DB_ONLY";
  return "ENV_ONLY";
}

export function loadEnvInstagramCredentials(env: InstagramEnvInput): InstagramOutboundCredentials | null {
  const facebookPageToken = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? "";
  const instagramToken = env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? "";
  const accessToken = facebookPageToken || instagramToken;
  const pageId = (env.FACEBOOK_PAGE_ID?.trim() || env.INSTAGRAM_PAGE_ID?.trim()) ?? "";
  if (!accessToken || !pageId) return null;

  const businessAccountId = env.INSTAGRAM_ACCOUNT_ID?.trim();
  return {
    accessToken,
    graphVersion: normalizeInstagramGraphVersion(env),
    pageId,
    ...(businessAccountId ? { businessAccountId } : {})
  };
}

export function instagramCredentialsFromRuntimeConfig(
  runtime: ChannelRuntimeConfig,
  graphVersion: string,
  businessAccountId?: string
): InstagramOutboundCredentials | null {
  const accessToken = runtime.secrets.accessToken?.trim() ?? "";
  const pageId = runtime.providerPageId?.trim() ?? "";
  if (!accessToken || !pageId) return null;

  return {
    accessToken,
    graphVersion,
    pageId,
    ...(businessAccountId ? { businessAccountId } : {})
  };
}

export function classifyInstagramDbRuntimeFallbackReason(
  setting: ChannelSettingPublicDto | null
): InstagramOutboundFallbackReason {
  if (!setting) return "not_configured";
  if (!setting.enabled) return "disabled";
  if (!setting.configured) return "not_configured";
  if (setting.status === "ERROR") return "error_state";
  return "unavailable";
}

export function buildInstagramRuntimeConfigUnavailableError(mode: InstagramRuntimeConfigMode): Error {
  const message =
    mode === "DB_ONLY"
      ? "Instagram outbound is not configured in channel settings."
      : "Instagram outbound runtime config is unavailable.";
  const err = new Error(sanitizeProviderErrorMessage(message));
  err.name = "InstagramOutboundRuntimeConfigError";
  return err;
}

export async function resolveInstagramOutboundConfig(input: {
  mode: InstagramRuntimeConfigMode;
  tenantId: string;
  env: InstagramEnvInput;
  getRuntimeConfig: (tenantId: string) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
}): Promise<ResolvedInstagramOutboundConfig> {
  const envCredentials = loadEnvInstagramCredentials(input.env);
  const graphVersion = normalizeInstagramGraphVersion(input.env);
  const businessAccountId = input.env.INSTAGRAM_ACCOUNT_ID?.trim();

  if (input.mode === "ENV_ONLY") {
    if (!envCredentials) throw buildInstagramRuntimeConfigUnavailableError(input.mode);
    return { source: "env", credentials: envCredentials };
  }

  const dbRuntime = await input.getRuntimeConfig(input.tenantId);
  const dbCredentials = dbRuntime
    ? instagramCredentialsFromRuntimeConfig(dbRuntime, graphVersion, businessAccountId)
    : null;

  if (input.mode === "DB_ONLY") {
    if (!dbCredentials) throw buildInstagramRuntimeConfigUnavailableError(input.mode);
    return { source: "db", credentials: dbCredentials };
  }

  if (dbCredentials) {
    return { source: "db", credentials: dbCredentials };
  }

  if (!envCredentials) {
    throw buildInstagramRuntimeConfigUnavailableError(input.mode);
  }

  const setting = input.findChannelSetting ? await input.findChannelSetting(input.tenantId) : null;
  return {
    source: "env",
    credentials: envCredentials,
    fallbackReason: classifyInstagramDbRuntimeFallbackReason(setting)
  };
}
