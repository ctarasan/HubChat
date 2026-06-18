/** Foundation-only feature flags — default OFF; no runtime consumer wiring in IG-AUTH-2A. */

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Enables Instagram OAuth schema/repository foundation code paths (future phases only). */
export function isInstagramOAuthFoundationEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_FOUNDATION_ENABLED");
}

/** Master gate for Instagram OAuth runtime routes and resolver (not wired in IG-AUTH-2A). */
export function isInstagramOAuthRuntimeEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_RUNTIME_ENABLED");
}
