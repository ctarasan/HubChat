import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createInstagramWebhookHandler, verifyInstagramWebhook } from "../../../../src/interfaces/api/webhook/instagram.js";

export async function GET(req: NextRequest): Promise<Response> {
  const result = verifyInstagramWebhook(req.nextUrl.searchParams);
  return new Response(result.body, { status: result.status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const deps = apiBootstrap();
  const handler = createInstagramWebhookHandler({
    webhookRepository: deps.webhookEventRepository
  });
  return (await handler(
    {
      rawBody,
      headers: req.headers,
      json: async () => JSON.parse(rawBody) as unknown
    },
    NextResponse
  )) as NextResponse;
}
