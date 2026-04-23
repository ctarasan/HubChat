import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createFacebookWebhookHandler, verifyFacebookWebhook } from "../../../../src/interfaces/api/webhook/facebook.js";

export async function GET(req: NextRequest): Promise<Response> {
  const result = verifyFacebookWebhook(req.nextUrl.searchParams);
  return new Response(result.body, { status: result.status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deps = apiBootstrap();
  const handler = createFacebookWebhookHandler({
    webhookRepository: deps.webhookEventRepository
  });
  return (await handler(req, NextResponse)) as NextResponse;
}
