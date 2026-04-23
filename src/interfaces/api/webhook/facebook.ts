import { z } from "zod";
import { createHash } from "node:crypto";
import type { WebhookEventRepository } from "../../../domain/ports.js";
import { FacebookAdapter } from "../../../infrastructure/adapters/channels/facebookAdapter.js";
import pino from "pino";

const postEnvSchema = z.object({
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1).optional()
});
const verifyEnvSchema = z.object({
  FACEBOOK_VERIFY_TOKEN: z.string().min(1)
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers; nextUrl?: { searchParams: URLSearchParams } };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  webhookRepository: WebhookEventRepository;
}

const logger = pino({ name: "facebook-webhook" });

export function createFacebookWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const startedAt = Date.now();
    const raw = await req.json();
    const payload = raw as { object?: string; entry?: unknown[] };
    if (payload.object !== "page" || !payload.entry?.length) {
      return res.json({ ok: true, ignored: "empty_or_non_page_event" }, { status: 200 });
    }

    const env = postEnvSchema.parse(process.env);
    const tenantId = req.headers.get("x-tenant-id") ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) return res.json({ error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or x-tenant-id" }, { status: 400 });

    const adapter = new FacebookAdapter({
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN
    });
    let normalized: Awaited<ReturnType<FacebookAdapter["receiveMessage"]>> | null = null;
    try {
      normalized = await adapter.receiveMessage(raw);
    } catch {
      normalized = null;
    }
    const debugPayload = raw as { entry?: Array<{ messaging?: unknown[]; changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
    const firstChange = debugPayload.entry?.[0]?.changes?.[0];
    const firstMessage = debugPayload.entry?.[0]?.messaging?.[0];
    console.log(
      "[facebook-webhook] normalized_result",
      JSON.stringify({
        normalized: normalized
          ? {
              externalEventId: normalized.externalEventId,
              externalMessageId: normalized.externalMessageId,
              text: normalized.text,
              channelThreadId: normalized.channelThreadId
            }
          : null,
        hasMessaging: Boolean(firstMessage),
        hasChanges: Boolean(firstChange),
        changeField: firstChange?.field ?? null,
        changeValueKeys: firstChange?.value ? Object.keys(firstChange.value) : []
      })
    );

    const payloadHash = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
    const fallbackExternalEventId = `facebook-raw:${payloadHash.slice(0, 16)}`;
    const fallbackIdempotencyKey = `facebook:raw:${payloadHash}`;

    if (!normalized) {
      const saved = await deps.webhookRepository.saveIfNotExists({
        tenantId,
        channelType: "FACEBOOK",
        externalEventId: fallbackExternalEventId,
        idempotencyKey: fallbackIdempotencyKey,
        payloadJson: raw as Record<string, unknown>
      });
      if (saved === "duplicate") return res.json({ ok: true, duplicate: true }, { status: 200 });
      logger.info(
        {
          tenantId,
          webhookEventId: fallbackExternalEventId,
          idempotencyKey: fallbackIdempotencyKey,
          webhookLatencyMs: Date.now() - startedAt
        },
        "Facebook webhook accepted (unsupported event persisted)"
      );
      return res.json({ ok: true, ignored: "unsupported_facebook_event_saved" }, { status: 200 });
    }

    const inboundPayload = {
      channel: "FACEBOOK" as const,
      tenantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      channelThreadId: normalized.channelThreadId,
      text: normalized.text,
      occurredAt: normalized.occurredAt
    };

    const saved = await deps.webhookRepository.saveInboundAndOutboxIfNotExists({
      tenantId,
      channelType: "FACEBOOK",
      externalEventId: normalized.externalEventId,
      idempotencyKey: normalized.idempotencyKey,
      payloadJson: raw as Record<string, unknown>,
      outboxTopic: "message.inbound.normalized",
      outboxPayload: inboundPayload,
      outboxIdempotencyKey: normalized.idempotencyKey
    });
    if (saved === "duplicate") {
      logger.info(
        {
          tenantId,
          webhookEventId: normalized.externalEventId,
          idempotencyKey: normalized.idempotencyKey,
          conversationId: normalized.channelThreadId,
          webhookLatencyMs: Date.now() - startedAt,
          duplicate: true
        },
        "Facebook webhook duplicate"
      );
      return res.json({ ok: true, duplicate: true }, { status: 200 });
    }

    logger.info(
      {
        tenantId,
        webhookEventId: normalized.externalEventId,
        idempotencyKey: normalized.idempotencyKey,
        conversationId: normalized.channelThreadId,
        webhookLatencyMs: Date.now() - startedAt
      },
      "Facebook webhook accepted"
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
