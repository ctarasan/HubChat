/** OAuth Test Connection feature flag — default OFF; does not enable delivery runtime. */

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isInstagramOAuthTestConnectionEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_TEST_CONNECTION_ENABLED");
}
