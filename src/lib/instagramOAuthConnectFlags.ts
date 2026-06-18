/** Instagram OAuth connect feature flag — default OFF; does not enable delivery runtime. */

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Enables Instagram Business Login OAuth start/callback routes (IG-AUTH-2C). */
export function isInstagramOAuthConnectEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_CONNECT_ENABLED");
}
