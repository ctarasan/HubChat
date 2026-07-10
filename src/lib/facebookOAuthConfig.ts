const DEFAULT_GRAPH_VERSION = "v25.0";
const REQUIRED_PAGE_TASKS = ["MESSAGING"] as const;

export type FacebookOAuthServerConfig = {
  oauthEnabled: boolean;
  appId: string | null;
  appSecret: string | null;
  graphVersion: string;
  appBaseUrl: string;
  callbackUrl: string;
  credentialEncryptionConfigured: boolean;
};

export type FacebookOAuthAvailability = {
  oauthAvailable: boolean;
};

function readTrimmedEnv(env: NodeJS.ProcessEnv, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function normalizeMetaGraphVersion(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_GRAPH_VERSION;
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function resolveFacebookOAuthAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = readTrimmedEnv(env, "NEXT_PUBLIC_APP_BASE_URL", "HUBCHAT_APP_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = readTrimmedEnv(env, "VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function buildFacebookOAuthCallbackUrl(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/$/, "")}/api/channel-connect/facebook/oauth/callback`;
}

export function readFacebookOAuthServerConfig(env: NodeJS.ProcessEnv = process.env): FacebookOAuthServerConfig {
  const oauthEnabled = readBooleanEnv(env, "HUBCHAT_FACEBOOK_OAUTH_ENABLED");
  const appId = readTrimmedEnv(env, "META_APP_ID", "FACEBOOK_APP_ID");
  const appSecret = readTrimmedEnv(env, "FACEBOOK_APP_SECRET", "META_APP_SECRET");
  const graphVersion = normalizeMetaGraphVersion(readTrimmedEnv(env, "META_GRAPH_VERSION", "FACEBOOK_GRAPH_VERSION"));
  const appBaseUrl = resolveFacebookOAuthAppBaseUrl(env);
  const callbackUrl = buildFacebookOAuthCallbackUrl(appBaseUrl);
  const credentialEncryptionConfigured = Boolean(readTrimmedEnv(env, "HUBCHAT_CREDENTIAL_ENCRYPTION_KEY"));

  return {
    oauthEnabled,
    appId,
    appSecret,
    graphVersion,
    appBaseUrl,
    callbackUrl,
    credentialEncryptionConfigured
  };
}

export function resolveFacebookOAuthAvailability(
  config: FacebookOAuthServerConfig = readFacebookOAuthServerConfig()
): FacebookOAuthAvailability {
  const oauthAvailable = Boolean(
    config.oauthEnabled &&
      config.appId &&
      config.appSecret &&
      config.callbackUrl &&
      config.credentialEncryptionConfigured
  );
  return { oauthAvailable };
}

export function getRequiredFacebookPageTasks(): readonly string[] {
  return REQUIRED_PAGE_TASKS;
}

export function facebookOAuthScopes(): string[] {
  return ["pages_show_list", "pages_messaging", "pages_manage_metadata"];
}
