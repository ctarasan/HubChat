import { z } from "zod";
import type { QueuePort, WebhookEventRepository } from "../../../domain/ports.js";
import { FacebookAdapter } from "../../../infrastructure/adapters/channels/facebookAdapter.js";

const postEnvSchema = z.object({
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1),
  FACEBOOK_VERIFY_TOKEN: z.string().min(1),
  DEFAULT_TENANT_ID: z.string().uuid().optional()
});
const verifyEnvSchema = z.object({
  FACEBOOK_VERIFY_TOKEN: z.string().min(1)
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers; nextUrl?: { searchParams: URLSearchParams } };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  queue: QueuePort;
  webhookRepository: WebhookEventRepository;
}

export function createFacebookWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const raw = await req.json();
    const payload = raw as { object?: string; entry?: unknown[] };
    if (payload.object !== "page" || !payload.entry?.length) {
      return res.json({ ok: true, ignored: "empty_or_non_page_event" }, { status: 200 });
    }

    const env = postEnvSchema.parse(process.env);
    const adapter = new FacebookAdapter({ pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN });
    const normalized = await adapter.receiveMessage(raw);

    const tenantId = req.headers.get("x-tenant-id") ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) return res.json({ error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or x-tenant-id" }, { status: 400 });

    const saved = await deps.webhookRepository.saveIfNotExists({
      tenantId,
      channelType: "FACEBOOK",
      externalEventId: normalized.externalEventId,
      idempotencyKey: normalized.idempotencyKey,
      payloadJson: raw as Record<string, unknown>
    });
    if (saved === "duplicate") return res.json({ ok: true, duplicate: true }, { status: 200 });

    await deps.queue.enqueue(
      "message.inbound.normalized",
      {
        channel: "FACEBOOK",
        tenantId,
        externalUserId: normalized.externalUserId,
        externalMessageId: normalized.externalMessageId,
        channelThreadId: normalized.channelThreadId,
        text: normalized.text,
        occurredAt: normalized.occurredAt
      },
      { idempotencyKey: normalized.idempotencyKey, tenantId }
    );

    return res.json({ ok: true }, { status: 200 });
  };
}

export function verifyFacebookWebhook(searchParams: URLSearchParams): { ok: boolean; body: string; status: number } {
  const env = verifyEnvSchema.parse(process.env);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.FACEBOOK_VERIFY_TOKEN && challenge) {
    return { ok: true, body: challenge, status: 200 };
  }
  return { ok: false, body: "Forbidden", status: 403 };
}
