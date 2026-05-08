import { z } from "zod";
import pino from "pino";
import type { WebhookEventRepository } from "../../../domain/ports.js";
import { INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT } from "../../../domain/instagramDmMessages.js";
import { InstagramAdapter } from "../../../infrastructure/adapters/channels/instagramAdapter.js";

const postEnvSchema = z.object({
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1).optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().min(1).optional(),
  FACEBOOK_GRAPH_VERSION: z.string().min(1).optional(),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().min(1).optional()
});

const verifyEnvSchema = z.object({
  INSTAGRAM_VERIFY_TOKEN: z.string().min(1).optional(),
  FACEBOOK_VERIFY_TOKEN: z.string().min(1).optional()
});

type NextRequest = { json: () => Promise<unknown>; headers: Headers; nextUrl?: { searchParams: URLSearchParams } };
type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

interface Deps {
  webhookRepository: WebhookEventRepository;
}

const logger = pino({ name: "instagram-webhook" });

/** Count nested messaging-shaped items for observability (no message contents logged). */
function countInstagramMessagingShapes(raw: unknown): number {
  const p = raw as {
    entry?: Array<{
      messaging?: unknown[];
      changes?: Array<{ value?: { messaging?: unknown[]; messages?: unknown[] } }>;
    }>;
  };
  let n = 0;
  for (const e of p.entry ?? []) {
    n += e.messaging?.length ?? 0;
    for (const c of e.changes ?? []) {
      const v = c.value;
      n += v?.messaging?.length ?? 0;
      n += v?.messages?.length ?? 0;
    }
  }
  return n;
}

export function verifyInstagramWebhook(searchParams: URLSearchParams): { ok: boolean; body: string; status: number } {
  const env = verifyEnvSchema.parse(process.env);
  const verifyToken = env.INSTAGRAM_VERIFY_TOKEN ?? env.FACEBOOK_VERIFY_TOKEN;
  if (!verifyToken) return { ok: false, body: "Missing verify token", status: 500 };
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return { ok: true, body: challenge, status: 200 };
  }
  return { ok: false, body: "Forbidden", status: 403 };
}

export function createInstagramWebhookHandler(deps: Deps) {
  return async function POST(req: NextRequest, res: NextResponse): Promise<Response> {
    const raw = await req.json();
    const payload = raw as { object?: string; entry?: unknown[] };
    logger.info(
      {
        object: payload.object ?? null,
        entryCount: payload.entry?.length ?? 0,
        messagingShapeCount: countInstagramMessagingShapes(raw)
      },
      "Instagram webhook POST received"
    );
    if ((payload.object !== "instagram" && payload.object !== "page") || !payload.entry?.length) {
      logger.info({ object: payload.object ?? null }, "Instagram webhook ignored (wrong object or empty entry)");
      return res.json({ ok: true, ignored: "empty_or_non_instagram_event" }, { status: 200 });
    }

    const env = postEnvSchema.parse(process.env);
    const tenantId = req.headers.get("x-tenant-id") ?? env.DEFAULT_TENANT_ID;
    if (!tenantId) return res.json({ error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or x-tenant-id" }, { status: 400 });

    const accessToken = env.INSTAGRAM_ACCESS_TOKEN ?? env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return res.json({ error: "Missing INSTAGRAM_ACCESS_TOKEN (or FACEBOOK_PAGE_ACCESS_TOKEN fallback)" }, { status: 500 });
    }
    const adapter = new InstagramAdapter({
      accessToken,
      graphVersion: env.META_GRAPH_VERSION ?? env.FACEBOOK_GRAPH_VERSION,
      businessAccountId: env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? env.INSTAGRAM_ACCOUNT_ID
    });
    let normalized: Awaited<ReturnType<InstagramAdapter["receiveMessage"]>> | null = null;
    try {
      normalized = await adapter.receiveMessage(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (
        reason.includes(INSTAGRAM_INBOUND_UNSUPPORTED_ATTACHMENT) ||
        reason.includes("Instagram inbound media is not supported in this phase") ||
        reason.includes("Unsupported Instagram webhook event payload")
      ) {
        logger.info({ tenantId, reason }, "Instagram webhook ignored unsupported event");
        return res.json({ ok: true, ignored: "unsupported_instagram_event" }, { status: 200 });
      }
      throw error;
    }
    const senderProfileImageUrl = normalized.profile?.profileImageUrl ?? normalized.profile?.avatarUrl ?? null;
    const inboundPayload = {
      channel: "INSTAGRAM" as const,
      tenantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      channelThreadId: normalized.channelThreadId,
      text: normalized.text,
      messageType: normalized.messageType ?? "TEXT",
      ...(typeof normalized.mediaUrl === "string" && normalized.mediaUrl.trim()
        ? { mediaUrl: normalized.mediaUrl.trim(), previewUrl: (normalized.previewUrl ?? normalized.mediaUrl).trim() }
        : {}),
      occurredAt: normalized.occurredAt,
      sourceThreadType: "INSTAGRAM_DM" as const,
      metadataJson: normalized.metadataJson ?? {},
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
    if (saved === "duplicate") {
      logger.info({ tenantId, externalEventId: normalized.externalEventId }, "Instagram webhook duplicate (idempotent)");
      return res.json({ ok: true, duplicate: true }, { status: 200 });
    }
    logger.info(
      { tenantId, externalEventId: normalized.externalEventId, externalUserId: normalized.externalUserId },
      "Instagram webhook accepted and enqueued"
    );
    return res.json({ ok: true }, { status: 200 });
  };
}
