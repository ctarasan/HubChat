import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createLineWebhookHandler } from "../../../../src/interfaces/api/webhook/line.js";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // LINE verify may call webhook with empty events; avoid infra bootstrapping for this path.
  const peek = (await req.clone().json().catch(() => null)) as { events?: unknown[] } | null;
  if (!peek?.events || peek.events.length === 0) {
    return NextResponse.json({ ok: true, ignored: "empty_events" }, { status: 200 });
  }

  const deps = apiBootstrap();
  const handler = createLineWebhookHandler({
    queue: deps.queue,
    webhookRepository: deps.webhookEventRepository
  });
  return (await handler(req, NextResponse)) as NextResponse;
}
