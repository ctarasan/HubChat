import { z } from "zod";
import type { WebhookEventRepository } from "../../../domain/ports.js";
import { LineAdapter } from "../../../infrastructure/adapters/channels/lineAdapter.js";
import pino from "pino";

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  DEFAULT_TENANT_ID: z.string().uuid().optional()
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  webhookRepository: WebhookEventRepository;
}

const logger = pino({ name: "line-webhook" });

export function createLineWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const startedAt = Date.now();
    const raw = await req.json();
    const payload = raw as { events?: unknown[] };
    if (!payload.events || payload.events.length === 0) {
      // LINE webhook verify can send empty events; acknowledge quickly.
      return res.json({ ok: true, ignored: "empty_events" }, { status: 200 });
    }
    const env = envSchema.parse(process.env);

    // Production note: validate LINE signature from `x-line-signature`.
    const adapter = new LineAdapter({
      channelSecret: env.LINE_CHANNEL_SECRET,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN
    });

    const normalized = await adapter.receiveMessage(raw);
    const tenantId = req.headers.get("x-tenant-id") ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) return res.json({ error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or x-tenant-id" }, { status: 400 });

    const senderProfileImageUrl = normalized.profile?.profileImageUrl ?? normalized.profile?.avatarUrl ?? null;
    const inboundPayload = {
      channel: "LINE" as const,
      tenantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      channelThreadId: normalized.channelThreadId,
      text: normalized.text,
      messageType: normalized.messageType ?? "TEXT",
      lineMessageId: normalized.lineMessageId ?? null,
      metadataJson: normalized.metadataJson ?? {},
      occurredAt: normalized.occurredAt,
      senderDisplayName: normalized.profile?.name ?? null,
      senderProfileImageUrl,
      profile: normalized.profile
    };
    const saved = await deps.webhookRepository.saveInboundAndOutboxIfNotExists({
      tenantId,
      channelType: "LINE",
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
          webhookLatencyMs: Date.now() - startedAt,
          duplicate: true
        },
        "LINE webhook duplicate"
      );
      return res.json({ ok: true, duplicate: true }, { status: 200 });
    }

    const diag = normalized.profileDiagnostics;
    logger.info(
      {
        tenantId,
        provider: "LINE",
        webhookEventId: normalized.externalEventId,
        idempotencyKey: normalized.idempotencyKey,
        conversationId: normalized.channelThreadId,
        externalUserId: normalized.externalUserId,
        displayNamePresent: Boolean(normalized.profile?.name),
        profileImagePresent: Boolean(senderProfileImageUrl),
        profileLookupAttempted: diag?.profileLookupAttempted ?? false,
        profileLookupSucceeded: diag?.profileLookupSucceeded ?? false,
        downloadAttempted: normalized.messageType === "IMAGE",
        webhookLatencyMs: Date.now() - startedAt
      },
      "LINE webhook accepted"
    );

    return res.json({ ok: true }, { status: 200 });
  };
}
