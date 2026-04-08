import { z } from "zod";
import type { QueuePort, WebhookEventRepository } from "../../../domain/ports.js";
import { LineAdapter } from "../../../infrastructure/adapters/channels/lineAdapter.js";

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1)
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  queue: QueuePort;
  webhookRepository: WebhookEventRepository;
}

export function createLineWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const env = envSchema.parse(process.env);
    const raw = await req.json();

    // Production note: validate LINE signature from `x-line-signature`.
    const adapter = new LineAdapter({
      channelSecret: env.LINE_CHANNEL_SECRET,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN
    });

    const normalized = await adapter.receiveMessage(raw);
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) return res.json({ error: "Missing x-tenant-id" }, { status: 400 });

    const saved = await deps.webhookRepository.saveIfNotExists({
      tenantId,
      channelType: "LINE",
      externalEventId: normalized.externalEventId,
      idempotencyKey: normalized.idempotencyKey,
      payloadJson: raw as Record<string, unknown>
    });
    if (saved === "duplicate") return res.json({ ok: true, duplicate: true }, { status: 200 });

    await deps.queue.enqueue(
      "message.inbound.normalized",
      {
        channel: "LINE",
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
