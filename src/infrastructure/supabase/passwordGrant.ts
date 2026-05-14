/**
 * Server-only: obtain a Supabase access token via password grant (anon key).
 * Used by /api/setup/supabase-token and /api/auth/login.
 */

type SupabaseTokenResponse = {
  access_token?: string;
  error_description?: string;
  msg?: string;
};

export async function fetchPasswordAccessToken(email: string, password: string): Promise<string> {
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY on server environment");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  const json = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;
  if (!response.ok) {
    const errorMessage = json.error_description ?? json.msg ?? `Supabase auth failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const accessToken = typeof json.access_token === "string" ? json.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("No access_token returned by Supabase");
  }
  return accessToken;
}
