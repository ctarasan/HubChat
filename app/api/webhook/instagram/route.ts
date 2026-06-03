import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import {
  createInstagramWebhookHandler,
  verifyInstagramWebhook
} from "../../../../src/interfaces/api/webhook/instagram.js";

export function createInstagramWebhookPostRoute(deps?: {
  apiBootstrapImpl?: typeof apiBootstrap;
  createInstagramWebhookHandlerImpl?: typeof createInstagramWebhookHandler;
}) {
  const apiBootstrapImpl = deps?.apiBootstrapImpl ?? apiBootstrap;
  const createInstagramWebhookHandlerImpl =
    deps?.createInstagramWebhookHandlerImpl ?? createInstagramWebhookHandler;

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const rawBody = await req.text();
    const boot = apiBootstrapImpl();
    const handler = createInstagramWebhookHandlerImpl({
      webhookRepository: boot.webhookEventRepository
    });
    return (await handler(
      {
        rawBody,
        headers: req.headers,
        json: async () => JSON.parse(rawBody) as unknown
      },
      NextResponse
    )) as NextResponse;
  };
}

export const POST = createInstagramWebhookPostRoute();

export async function GET(req: NextRequest): Promise<Response> {
  const result = verifyInstagramWebhook(req.nextUrl.searchParams);
  return new Response(result.body, { status: result.status });
}
