import { NextRequest, NextResponse } from "next/server";

type SupabaseTokenResponse = {
  access_token?: string;
  error_description?: string;
  msg?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json({ error: "username and password are required" }, { status: 400 });
    }

    const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
    const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY on server environment" },
        { status: 500 }
      );
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: username, password }),
      cache: "no-store"
    });

    const json = (await response.json().catch(() => ({}))) as SupabaseTokenResponse;
    if (!response.ok) {
      const errorMessage = json.error_description ?? json.msg ?? `Supabase auth failed (${response.status})`;
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const accessToken = typeof json.access_token === "string" ? json.access_token.trim() : "";
    if (!accessToken) {
      return NextResponse.json({ error: "No access_token returned by Supabase" }, { status: 500 });
    }

    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "Failed to request Supabase token" }, { status: 500 });
  }
}
