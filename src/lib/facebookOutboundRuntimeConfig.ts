import type { ChannelRuntimeConfig, ChannelSettingPublicDto } from "../domain/channelSettings.js";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

export type FacebookRuntimeConfigMode = "ENV_ONLY" | "DB_WITH_ENV_FALLBACK" | "DB_ONLY";

export type FacebookOutboundCredentials = {
  pageAccessToken: string;
  graphVersion?: string;
  providerPageId?: string | null;
};

export type FacebookOutboundConfigSource = "env" | "db" | "meta_page_credential";

export type FacebookOutboundFallbackReason =
  | "disabled"
  | "not_configured"
  | "error_state"
  | "unavailable";

export type ResolvedFacebookOutboundConfig = {
  source: FacebookOutboundConfigSource;
  credentials: FacebookOutboundCredentials;
  fallbackReason?: FacebookOutboundFallbackReason;
};

export type FacebookEnvInput = {
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_PAGE_ID?: string;
  META_GRAPH_VERSION?: string;
  FACEBOOK_GRAPH_VERSION?: string;
};

const DEFAULT_GRAPH_VERSION = "v25.0";

export function normalizeFacebookGraphVersion(env: FacebookEnvInput): string {
  const raw = (env.META_GRAPH_VERSION ?? env.FACEBOOK_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION).trim();
  if (!raw) return DEFAULT_GRAPH_VERSION;
  if (/^\d+\.\d+$/.test(raw)) return `v${raw}`;
  if (/^v\d+\.\d+$/i.test(raw)) return raw.startsWith("v") ? raw : `v${raw.slice(1)}`;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export function parseFacebookRuntimeConfigMode(raw: string | undefined): FacebookRuntimeConfigMode {
  const normalized = (raw ?? "ENV_ONLY").trim().toUpperCase();
  if (normalized === "DB_WITH_ENV_FALLBACK") return "DB_WITH_ENV_FALLBACK";
  if (normalized === "DB_ONLY") return "DB_ONLY";
  return "ENV_ONLY";
}

export function loadEnvFacebookCredentials(env: FacebookEnvInput): FacebookOutboundCredentials | null {
  const pageAccessToken = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? "";
  if (!pageAccessToken) return null;
  const pageId = env.FACEBOOK_PAGE_ID?.trim();
  return {
    pageAccessToken,
    graphVersion: normalizeFacebookGraphVersion(env),
    providerPageId: pageId && pageId.length > 0 ? pageId : null
  };
}

export function facebookCredentialsFromRuntimeConfig(
  runtime: ChannelRuntimeConfig,
  graphVersion: string
): FacebookOutboundCredentials | null {
  const pageAccessToken = runtime.secrets.accessToken?.trim() ?? "";
  if (!pageAccessToken) return null;
  return {
    pageAccessToken,
    graphVersion,
    providerPageId: runtime.providerPageId
  };
}

export function classifyFacebookDbRuntimeFallbackReason(
  setting: ChannelSettingPublicDto | null
): FacebookOutboundFallbackReason {
  if (!setting) return "not_configured";
  if (!setting.enabled) return "disabled";
  if (!setting.configured) return "not_configured";
  if (setting.status === "ERROR") return "error_state";
  return "unavailable";
}

export function buildFacebookRuntimeConfigUnavailableError(mode: FacebookRuntimeConfigMode): Error {
  const message =
    mode === "DB_ONLY"
      ? "Facebook outbound is not configured in channel settings."
      : "Facebook outbound runtime config is unavailable.";
  const err = new Error(sanitizeProviderErrorMessage(message));
  err.name = "FacebookOutboundRuntimeConfigError";
  return err;
}

export async function resolveFacebookOutboundConfig(input: {
  mode: FacebookRuntimeConfigMode;
  tenantId: string;
  env: FacebookEnvInput;
  getRuntimeConfig: (tenantId: string) => Promise<ChannelRuntimeConfig | null>;
  findChannelSetting?: (tenantId: string) => Promise<ChannelSettingPublicDto | null>;
}): Promise<ResolvedFacebookOutboundConfig> {
  const envCredentials = loadEnvFacebookCredentials(input.env);
  const graphVersion = normalizeFacebookGraphVersion(input.env);

  if (input.mode === "ENV_ONLY") {
    if (!envCredentials) throw buildFacebookRuntimeConfigUnavailableError(input.mode);
    return { source: "env", credentials: envCredentials };
  }

  const dbRuntime = await input.getRuntimeConfig(input.tenantId);
  const dbCredentials = dbRuntime ? facebookCredentialsFromRuntimeConfig(dbRuntime, graphVersion) : null;

  if (input.mode === "DB_ONLY") {
    if (!dbCredentials) throw buildFacebookRuntimeConfigUnavailableError(input.mode);
    return { source: "db", credentials: dbCredentials };
  }

  if (dbCredentials) {
    return { source: "db", credentials: dbCredentials };
  }

  if (!envCredentials) {
    throw buildFacebookRuntimeConfigUnavailableError(input.mode);
  }

  const setting = input.findChannelSetting ? await input.findChannelSetting(input.tenantId) : null;
  return {
    source: "env",
    credentials: envCredentials,
    fallbackReason: classifyFacebookDbRuntimeFallbackReason(setting)
  };
}
