import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createLineWebhookHandler } from "../../../../src/interfaces/api/webhook/line.js";
import { verifyLineWebhookSignature } from "../../../../src/interfaces/api/webhook/webhookSignature.js";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  let peek: { events?: unknown[] } | null = null;
  try {
    peek = JSON.parse(rawBody) as { events?: unknown[] };
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  // LINE verify may call webhook with empty events; avoid infra bootstrapping for this path.
  if (!peek?.events || peek.events.length === 0) {
    const signatureResult = verifyLineWebhookSignature({
      channelSecret: process.env.LINE_CHANNEL_SECRET,
      signatureHeader: req.headers.get("x-line-signature"),
      rawBody
    });
    if (!signatureResult.ok) {
      return NextResponse.json({ error: signatureResult.error }, { status: signatureResult.status });
    }
    return NextResponse.json({ ok: true, ignored: "empty_events" }, { status: 200 });
  }

  const deps = apiBootstrap();
  const handler = createLineWebhookHandler({
    webhookRepository: deps.webhookEventRepository
  });
  return (await handler(
    {
      rawBody,
      headers: req.headers,
      json: async () => peek
    },
    NextResponse
  )) as NextResponse;
}
