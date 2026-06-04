import type { ChannelConnectRuntimeMode } from "../domain/channelConnectRuntime.js";
import type { ChannelConnectProvider } from "../domain/channelConnections.js";
import { parseFacebookRuntimeConfigMode } from "./facebookOutboundRuntimeConfig.js";
import { parseInstagramRuntimeConfigMode } from "./instagramOutboundRuntimeConfig.js";
import { parseLineRuntimeConfigMode } from "./lineOutboundRuntimeConfig.js";

export function parseChannelConnectRuntimeMode(
  provider: ChannelConnectProvider,
  raw: string | undefined
): ChannelConnectRuntimeMode {
  switch (provider) {
    case "LINE":
      return parseLineRuntimeConfigMode(raw);
    case "FACEBOOK":
      return parseFacebookRuntimeConfigMode(raw);
    case "INSTAGRAM":
      return parseInstagramRuntimeConfigMode(raw);
    default:
      return "ENV_ONLY";
  }
}

export function parseChannelConnectRuntimeModeFromEnv(
  provider: ChannelConnectProvider,
  env: Record<string, string | undefined> = process.env
): ChannelConnectRuntimeMode {
  switch (provider) {
    case "LINE":
      return parseChannelConnectRuntimeMode(provider, env.HUBCHAT_LINE_RUNTIME_CONFIG_MODE);
    case "FACEBOOK":
      return parseChannelConnectRuntimeMode(provider, env.HUBCHAT_FACEBOOK_RUNTIME_CONFIG_MODE);
    case "INSTAGRAM":
      return parseChannelConnectRuntimeMode(provider, env.HUBCHAT_INSTAGRAM_RUNTIME_CONFIG_MODE);
    default:
      return "ENV_ONLY";
  }
}

/** When false (default), resolver preserves legacy ENV-only behavior without CCP-1 DB reads. */
export function isChannelConnectResolverEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.HUBCHAT_CHANNEL_CONNECT_RESOLVER_ENABLED?.trim() === "true";
}

export function shouldAttemptChannelConnectDb(
  mode: ChannelConnectRuntimeMode,
  resolverEnabled: boolean
): boolean {
  if (!resolverEnabled) return false;
  return mode === "DB_WITH_ENV_FALLBACK" || mode === "DB_ONLY";
}
