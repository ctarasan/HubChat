import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createFacebookWebhookHandler } from "../../../../src/interfaces/api/webhook/facebook.js";
import { verifyInstagramWebhook } from "../../../../src/interfaces/api/webhook/instagram.js";
import { resolveMetaAppSecret, verifyMetaHubSignature256 } from "../../../../src/interfaces/api/webhook/webhookSignature.js";

export function createInstagramWebhookPostRoute(deps?: {
  apiBootstrapImpl?: typeof apiBootstrap;
  createFacebookWebhookHandlerImpl?: typeof createFacebookWebhookHandler;
}) {
  const apiBootstrapImpl = deps?.apiBootstrapImpl ?? apiBootstrap;
  const createFacebookWebhookHandlerImpl = deps?.createFacebookWebhookHandlerImpl ?? createFacebookWebhookHandler;

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const rawBody = await req.text();

    const signatureResult = verifyMetaHubSignature256({
      appSecret: resolveMetaAppSecret(),
      signatureHeader: req.headers.get("x-hub-signature-256"),
      rawBody
    });
    if (!signatureResult.ok) {
      return NextResponse.json({ error: signatureResult.error }, { status: signatureResult.status });
    }

    const boot = apiBootstrapImpl();
    const handler = createFacebookWebhookHandlerImpl({
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
