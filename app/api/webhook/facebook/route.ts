import { NextRequest, NextResponse } from "next/server";
import pino from "pino";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createFacebookWebhookHandler, verifyFacebookWebhook } from "../../../../src/interfaces/api/webhook/facebook.js";
import {
  evaluateMetaHubWebhookSignature,
  FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
  type MetaWebhookSignatureDiagnostics
} from "../../../../src/interfaces/api/webhook/webhookSignature.js";

const signatureLogger = pino({ name: "facebook-webhook-signature" });

export function logFacebookWebhookSignatureDiagnostics(
  diagnostics: MetaWebhookSignatureDiagnostics,
  passed: boolean
): void {
  if (passed) {
    signatureLogger.info(diagnostics, "Facebook webhook signature verified");
  } else {
    signatureLogger.warn(diagnostics, "Facebook webhook signature rejected");
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const result = verifyFacebookWebhook(req.nextUrl.searchParams);
  return new Response(result.body, { status: result.status });
}

export function createFacebookWebhookPostRoute(deps?: {
  apiBootstrapImpl?: typeof apiBootstrap;
  createFacebookWebhookHandlerImpl?: typeof createFacebookWebhookHandler;
  logSignatureDiagnostics?: (
    diagnostics: MetaWebhookSignatureDiagnostics,
    passed: boolean
  ) => void;
}) {
  const apiBootstrapImpl = deps?.apiBootstrapImpl ?? apiBootstrap;
  const createFacebookWebhookHandlerImpl = deps?.createFacebookWebhookHandlerImpl ?? createFacebookWebhookHandler;
  const logSignatureDiagnostics =
    deps?.logSignatureDiagnostics ?? logFacebookWebhookSignatureDiagnostics;

  return async function POST(req: NextRequest): Promise<NextResponse> {
    const rawBody = await req.text();
    const { result, diagnostics } = evaluateMetaHubWebhookSignature({
      route: FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
      signature256Header: req.headers.get("x-hub-signature-256"),
      signatureHeader: req.headers.get("x-hub-signature"),
      rawBody,
      userAgent: req.headers.get("user-agent")
    });
    logSignatureDiagnostics(diagnostics, result.ok);

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

export const POST = createFacebookWebhookPostRoute();
