import { NextResponse } from "next/server";
import { toClientErrorDetail } from "../../lib/supabasePostgrestError.js";

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function conflict(data: unknown): NextResponse {
  return NextResponse.json(data, { status: 409 });
}

export function serverError(error: unknown): NextResponse {
  return NextResponse.json(
    { error: "Internal server error", detail: toClientErrorDetail(error) },
    { status: 500 }
  );
}

export function notImplemented(data: unknown): NextResponse {
  return NextResponse.json(data, { status: 501 });
}
