/** Worker routing gate for Instagram OAuth outbound delivery (default OFF; IG-AUTH-2E.3). */

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isInstagramOAuthWorkerRoutingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_WORKER_ROUTING_ENABLED");
}
