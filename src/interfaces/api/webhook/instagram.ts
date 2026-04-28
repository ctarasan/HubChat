import { z } from "zod";
import type { WebhookEventRepository } from "../../../domain/ports.js";
import { InstagramAdapter } from "../../../infrastructure/adapters/channels/instagramAdapter.js";

const postEnvSchema = z.object({
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1)
});

const verifyEnvSchema = z.object({
  INSTAGRAM_VERIFY_TOKEN: z.string().min(1)
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers; nextUrl?: { searchParams: URLSearchParams } };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  webhookRepository: WebhookEventRepository;
}

export function verifyInstagramWebhook(searchParams: URLSearchParams): { ok: boolean; body: string; status: number } {
  const env = verifyEnvSchema.parse(process.env);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === env.INSTAGRAM_VERIFY_TOKEN && challenge) {
    return { ok: true, body: challenge, status: 200 };
  }
  return { ok: false, body: "Forbidden", status: 403 };
}

export function createInstagramWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const raw = await req.json();
    const payload = raw as { object?: string; entry?: unknown[] };
    if (payload.object !== "instagram" || !payload.entry?.length) {
      return res.json({ ok: true, ignored: "empty_or_non_instagram_event" }, { status: 200 });
    }

    const env = postEnvSchema.parse(process.env);
    const tenantId = req.headers.get("x-tenant-id") ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) return res.json({ error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or x-tenant-id" }, { status: 400 });

    const adapter = new InstagramAdapter({ accessToken: env.INSTAGRAM_ACCESS_TOKEN });
    const normalized = await adapter.receiveMessage(raw);
    const senderProfileImageUrl = normalized.profile?.profileImageUrl ?? normalized.profile?.avatarUrl ?? null;
    const inboundPayload = {
      channel: "INSTAGRAM" as const,
      tenantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      channelThreadId: normalized.channelThreadId,
      text: normalized.text,
      messageType: "TEXT" as const,
      occurredAt: normalized.occurredAt,
      senderDisplayName: normalized.profile?.name ?? null,
      senderProfileImageUrl,
      profile: normalized.profile
    };

    const saved = await deps.webhookRepository.saveInboundAndOutboxIfNotExists({
      tenantId,
      channelType: "INSTAGRAM",
      externalEventId: normalized.externalEventId,
      idempotencyKey: normalized.idempotencyKey,
      payloadJson: raw as Record<string, unknown>,
      outboxTopic: "message.inbound.normalized",
      outboxPayload: inboundPayload,
      outboxIdempotencyKey: normalized.idempotencyKey
    });
    if (saved === "duplicate") return res.json({ ok: true, duplicate: true }, { status: 200 });
    return res.json({ ok: true }, { status: 200 });
  };
}
