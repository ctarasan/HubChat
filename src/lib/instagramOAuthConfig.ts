import { isInstagramOAuthConnectEnabled } from "./instagramOAuthConnectFlags.js";

const DEFAULT_GRAPH_VERSION = "v25.0";

/** Approved Instagram Business Login scopes for HubChat connect (server-controlled). */
export const INSTAGRAM_OAUTH_CONNECT_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages"
] as const;

export type InstagramOAuthServerConfig = {
  connectEnabled: boolean;
  appId: string | null;
  appSecret: string | null;
  graphVersion: string;
  appBaseUrl: string;
  callbackUrl: string;
  credentialEncryptionConfigured: boolean;
};

export type InstagramOAuthConnectAvailability = {
  connectAvailable: boolean;
};

function readTrimmedEnv(env: NodeJS.ProcessEnv, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function normalizeMetaGraphVersion(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_GRAPH_VERSION;
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function resolveInstagramOAuthAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = readTrimmedEnv(env, "NEXT_PUBLIC_APP_BASE_URL", "HUBCHAT_APP_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = readTrimmedEnv(env, "VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function buildInstagramOAuthCallbackUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/api/channel-connect/instagram/oauth/callback`;
}

export function readInstagramOAuthServerConfig(env: NodeJS.ProcessEnv = process.env): InstagramOAuthServerConfig {
  const connectEnabled = isInstagramOAuthConnectEnabled(env);
  const appId = readTrimmedEnv(env, "META_APP_ID", "INSTAGRAM_APP_ID");
  const appSecret = readTrimmedEnv(env, "FACEBOOK_APP_SECRET", "META_APP_SECRET", "INSTAGRAM_APP_SECRET");
  const graphVersion = normalizeMetaGraphVersion(readTrimmedEnv(env, "META_GRAPH_VERSION", "INSTAGRAM_GRAPH_VERSION"));
  const appBaseUrl = resolveInstagramOAuthAppBaseUrl(env);
  const callbackUrl = buildInstagramOAuthCallbackUrl(appBaseUrl);
  const credentialEncryptionConfigured = Boolean(readTrimmedEnv(env, "HUBCHAT_CREDENTIAL_ENCRYPTION_KEY"));

  return {
    connectEnabled,
    appId,
    appSecret,
    graphVersion,
    appBaseUrl,
    callbackUrl,
    credentialEncryptionConfigured
  };
}

export function resolveInstagramOAuthConnectAvailability(
  config: InstagramOAuthServerConfig = readInstagramOAuthServerConfig()
): InstagramOAuthConnectAvailability {
  const connectAvailable = Boolean(
    config.connectEnabled &&
      config.appId &&
      config.appSecret &&
      config.callbackUrl &&
      config.credentialEncryptionConfigured
  );
  return { connectAvailable };
}

export function instagramOAuthConnectScopes(): string[] {
  return [...INSTAGRAM_OAUTH_CONNECT_SCOPES];
}
