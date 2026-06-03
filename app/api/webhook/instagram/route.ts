import { NextRequest, NextResponse } from "next/server";
import pino from "pino";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import {
  createInstagramWebhookHandler,
  verifyInstagramWebhook
} from "../../../../src/interfaces/api/webhook/instagram.js";
import {
  evaluateMetaHubWebhookSignature,
  INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
  resolveMetaAppSecret,
  type MetaWebhookSignatureDiagnostics
} from "../../../../src/interfaces/api/webhook/webhookSignature.js";

const signatureLogger = pino({ name: "instagram-webhook-signature" });

export function logInstagramWebhookSignatureDiagnostics(
  diagnostics: MetaWebhookSignatureDiagnostics,
  passed: boolean
): void {
  if (passed) {
    signatureLogger.info(diagnostics, "Instagram webhook signature verified");
  } else {
    signatureLogger.warn(diagnostics, "Instagram webhook signature rejected");
  }
}

export function createInstagramWebhookPostRoute(deps?: {
  apiBootstrapImpl?: typeof apiBootstrap;
  createInstagramWebhookHandlerImpl?: typeof createInstagramWebhookHandler;
  logSignatureDiagnostics?: (
    diagnostics: MetaWebhookSignatureDiagnostics,
    passed: boolean
  ) => void;
}) {
  const apiBootstrapImpl = deps?.apiBootstrapImpl ?? apiBootstrap;
  const createInstagramWebhookHandlerImpl =
    deps?.createInstagramWebhookHandlerImpl ?? createInstagramWebhookHandler;
  const logSignatureDiagnostics =
    deps?.logSignatureDiagnostics ?? logInstagramWebhookSignatureDiagnostics;

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const rawBody = await req.text();
    const { result, diagnostics } = evaluateMetaHubWebhookSignature({
      route: INSTAGRAM_WEBHOOK_SIGNATURE_ROUTE,
      appSecret: resolveMetaAppSecret(),
      signature256Header: req.headers.get("x-hub-signature-256"),
      signatureHeader: req.headers.get("x-hub-signature"),
      rawBody,
      userAgent: req.headers.get("user-agent")
    });
    logSignatureDiagnostics(diagnostics, result.ok);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

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
