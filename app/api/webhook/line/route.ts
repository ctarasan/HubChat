import { NextRequest, NextResponse } from "next/server";
import { apiBootstrap } from "../../../../src/interfaces/api/bootstrap.js";
import { createLineWebhookHandler } from "../../../../src/interfaces/api/webhook/line.js";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deps = apiBootstrap();
  const handler = createLineWebhookHandler({
    queue: deps.queue,
    webhookRepository: deps.webhookEventRepository
  });
  return (await handler(req, NextResponse)) as NextResponse;
}
