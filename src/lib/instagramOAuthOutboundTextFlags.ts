import {
  isInstagramOAuthFoundationEnabled,
  isInstagramOAuthRuntimeEnabled
} from "./instagramOAuthFoundationFlags.js";

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Enables Instagram OAuth outbound text delivery service (default OFF; no worker wiring in IG-AUTH-2E.1). */
export function isInstagramOAuthOutboundTextEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    isInstagramOAuthFoundationEnabled(env) &&
    isInstagramOAuthRuntimeEnabled(env) &&
    readBooleanEnv(env, "HUBCHAT_INSTAGRAM_OAUTH_OUTBOUND_TEXT_ENABLED")
  );
}
