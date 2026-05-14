import { NextRequest, NextResponse } from "next/server";
import { fetchPasswordAccessToken } from "../../../../src/infrastructure/supabase/passwordGrant.js";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json({ error: "username and password are required" }, { status: 400 });
    }

    try {
      const accessToken = await fetchPasswordAccessToken(username, password);
      return NextResponse.json({ accessToken });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to request token";
      if (msg.includes("Missing SUPABASE_URL")) {
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to request Supabase token" }, { status: 500 });
  }
}
