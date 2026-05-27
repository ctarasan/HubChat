/**
 * Setup token route is disabled by default (production-safe).
 * Enable only for local/dev via HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN=true.
 */
export function isSetupSupabaseTokenRouteEnabled(): boolean {
  const raw = process.env.HUBCHAT_ALLOW_SETUP_SUPABASE_TOKEN?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
