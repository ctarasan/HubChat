import { z } from "zod";
import { createHash } from "node:crypto";
import type { ChannelConnectionRepository, WebhookEventRepository } from "../../../domain/ports.js";
import { FacebookAdapter } from "../../../infrastructure/adapters/channels/facebookAdapter.js";
import { isFacebookReactionOnlyWebhookPayload } from "../../../lib/facebookInboundCommentKind.js";
import { isFacebookPageSelfCommentOnlyWebhookPayload } from "../../../lib/facebookPageSelfComment.js";
import { parseFacebookMessengerWebhookEvents } from "../../../lib/facebookMessengerWebhookEvents.js";
import {
  extractFacebookWebhookEntryPageIds,
  resolveFacebookWebhookTenantId
} from "../../../lib/facebookWebhookTenantResolve.js";
import { createInstagramWebhookHandler } from "./instagram.js";
import {
  FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
  verifyMetaHubWebhookSignature
} from "./webhookSignature.js";
import type { WebhookPostRequest } from "./line.js";
import pino from "pino";

const postEnvSchema = z.object({
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  FACEBOOK_PAGE_ID: z.string().min(1).optional(),
  FACEBOOK_GRAPH_VERSION: z.string().min(1).optional(),
  META_GRAPH_VERSION: z.string().min(1).optional()
});
const verifyEnvSchema = z.object({
  FACEBOOK_VERIFY_TOKEN: z.string().min(1)
});

type NextResponse = { json: (body: unknown, init?: { status?: number }) => Response };

function parseWebhookJson(rawBody: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false };
  }
}

interface Deps {
  webhookRepository: WebhookEventRepository;
  channelConnectionRepository?: ChannelConnectionRepository;
}

const logger = pino({ name: "facebook-webhook" });

export function createFacebookWebhookHandler(deps: Deps) {
  return async function POST(req: WebhookPostRequest, res: NextResponse): Promise<Response> {
    const startedAt = Date.now();
    const signatureResult = verifyMetaHubWebhookSignature({
      route: FACEBOOK_WEBHOOK_SIGNATURE_ROUTE,
      signature256Header: req.headers.get("x-hub-signature-256"),
      signatureHeader: req.headers.get("x-hub-signature"),
      rawBody: req.rawBody
    });
    if (!signatureResult.ok) {
      return res.json({ error: signatureResult.error }, { status: signatureResult.status });
    }

    const parsed = parseWebhookJson(req.rawBody);
    if (!parsed.ok) {
      return res.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    const raw = parsed.value;
    const payload = raw as { object?: string; entry?: unknown[] };

    // Meta sends Instagram Messaging with object "instagram" (see Messenger Platform Instagram webhooks doc).
    // Apps typically use one callback URL for both Page + Instagram subscriptions; route those events here too.
    if (payload.object === "instagram" && payload.entry?.length) {
      const igHandler = createInstagramWebhookHandler(deps);
      const syntheticReq: WebhookPostRequest = {
        json: async () => raw,
        headers: req.headers,
        rawBody: req.rawBody
      };
      return igHandler(syntheticReq, res);
    }

    if (payload.object !== "page" || !payload.entry?.length) {
      return res.json({ ok: true, ignored: "empty_or_non_page_event" }, { status: 200 });
    }

    const env = postEnvSchema.parse(process.env);
    const entryPageIds = extractFacebookWebhookEntryPageIds(raw);
    let connectionsByPageId = [] as Awaited<
      ReturnType<NonNullable<Deps["channelConnectionRepository"]>["listByProviderPageId"]>
    >;
    if (deps.channelConnectionRepository && entryPageIds.length > 0) {
      const lists = await Promise.all(
        entryPageIds.map((pageId) =>
          deps.channelConnectionRepository!.listByProviderPageId({
            provider: "FACEBOOK",
            providerPageId: pageId
          })
        )
      );
      connectionsByPageId = lists.flat();
    }
    const tenantResolve = resolveFacebookWebhookTenantId({
      entryPageIds,
      connectionsByPageId,
      fallbackTenantId: env.DEFAULT_TENANT_ID,
      headerTenantId: req.headers.get("x-tenant-id")
    });
    const tenantId = tenantResolve.tenantId;
    if (!tenantId) {
      return res.json(
        { error: "Missing tenant mapping. Set DEFAULT_TENANT_ID or connect the Page via OAuth." },
        { status: 400 }
      );
    }
    if (tenantResolve.ambiguous) {
      logger.warn(
        {
          provider: "FACEBOOK",
          matched_page_id_present: Boolean(tenantResolve.matchedPageId),
          tenant_source: tenantResolve.source
        },
        "Facebook webhook page matched multiple tenants; using fallback tenant"
      );
    } else if (tenantResolve.source === "page_connection") {
      logger.info(
        {
          provider: "FACEBOOK",
          tenant_source: "page_connection",
          matched_page_id_present: Boolean(tenantResolve.matchedPageId)
        },
        "Facebook webhook tenant resolved from channel connection page id"
      );
    }

    const adapter = new FacebookAdapter({
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      graphVersion: env.META_GRAPH_VERSION ?? env.FACEBOOK_GRAPH_VERSION,
      pageId: env.FACEBOOK_PAGE_ID
    });

    const pagePayload = raw as { entry?: Array<{ id?: string; messaging?: unknown[] }> };
    const messengerEvents = parseFacebookMessengerWebhookEvents({
      entry: pagePayload.entry ?? [],
      pageId: env.FACEBOOK_PAGE_ID ?? null
    });
    const echoEvents = messengerEvents.filter((event) => event.kind === "message_echo");
    let echoEnqueued = 0;
    for (const echo of echoEvents) {
      const echoOutboxPayload = {
        webhookIngestKind: "facebook_messenger_echo" as const,
        tenantId,
        channel: "FACEBOOK" as const,
        externalMessageId: echo.externalMessageId,
        customerPsid: echo.customerPsid,
        channelThreadId: echo.channelThreadId,
        text: echo.text,
        messageType: echo.messageType,
        mediaUrl: echo.mediaUrl,
        previewUrl: echo.previewUrl,
        occurredAt: echo.occurredAt,
        facebookPageId: echo.facebookPageId,
        queueCreatedAt: new Date().toISOString()
      };
      const saved = await deps.webhookRepository.saveInboundAndOutboxIfNotExists({
        tenantId,
        channelType: "FACEBOOK",
        externalEventId: echo.externalEventId,
        idempotencyKey: echo.idempotencyKey,
        payloadJson: raw as Record<string, unknown>,
        outboxTopic: "message.inbound.normalized",
        outboxPayload: echoOutboxPayload,
        outboxIdempotencyKey: echo.idempotencyKey
      });
      if (saved === "inserted") echoEnqueued += 1;
      logger.info(
        {
          provider: "FACEBOOK",
          event_type: "facebook_message_echo",
          result: saved === "duplicate" ? "deduplicated" : "accepted",
          has_mid: true,
          webhookLatencyMs: Date.now() - startedAt
        },
        "Facebook messenger echo webhook accepted"
      );
    }

    let normalized: Awaited<ReturnType<FacebookAdapter["receiveMessage"]>> | null = null;
    try {
      normalized = await adapter.receiveMessage(raw);
    } catch {
      normalized = null;
    }
    const payloadHash = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
    const fallbackExternalEventId = `facebook-raw:${payloadHash.slice(0, 16)}`;
    const fallbackIdempotencyKey = `facebook:raw:${payloadHash}`;

    if (!normalized && echoEvents.length === 0) {
      if (isFacebookReactionOnlyWebhookPayload(raw)) {
        logger.info(
          {
            provider: "FACEBOOK",
            facebook_inbound_kind: "reaction",
            ignored: "reaction_event",
            webhookLatencyMs: Date.now() - startedAt
          },
          "Facebook reaction webhook ignored"
        );
        return res.json({ ok: true, ignored: "reaction_event" }, { status: 200 });
      }
      if (isFacebookPageSelfCommentOnlyWebhookPayload(raw, env.FACEBOOK_PAGE_ID)) {
        logger.info(
          {
            provider: "FACEBOOK",
            ignored: "facebook_page_self_comment",
            page_id_present: Boolean(env.FACEBOOK_PAGE_ID?.trim()),
            webhookLatencyMs: Date.now() - startedAt
          },
          "Facebook page self comment webhook ignored"
        );
        return res.json({ ok: true, ignored: "facebook_page_self_comment" }, { status: 200 });
      }
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

    if (!normalized) {
      return res.json({ ok: true, echoesAccepted: echoEnqueued }, { status: 200 });
    }

    const senderProfileImageUrl = normalized.profile?.profileImageUrl ?? normalized.profile?.avatarUrl ?? null;
    const inboundPayload = {
      channel: "FACEBOOK" as const,
      tenantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      channelThreadId: normalized.channelThreadId,
      text: normalized.text,
      messageType: normalized.messageType ?? "TEXT",
      mediaUrl: normalized.mediaUrl ?? null,
      previewUrl: normalized.previewUrl ?? null,
      occurredAt: normalized.occurredAt,
      senderDisplayName: normalized.profile?.name ?? null,
      senderProfileImageUrl,
      sourceThreadType: normalized.sourceThreadType ?? "MESSENGER_DM",
      facebookPageId: normalized.facebookPageId ?? null,
      facebookPostId: normalized.facebookPostId ?? null,
      facebookCommentId: normalized.facebookCommentId ?? null,
      metadataJson: normalized.metadataJson ?? {},
      profile: normalized.profile,
      queueCreatedAt: new Date().toISOString()
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

    const diag = normalized.profileDiagnostics;
    logger.info(
      {
        tenantId,
        provider: "FACEBOOK",
        webhookEventId: normalized.externalEventId,
        idempotencyKey: normalized.idempotencyKey,
        conversationId: normalized.channelThreadId,
        externalUserId: normalized.externalUserId,
        displayNamePresent: Boolean(normalized.profile?.name),
        profileImagePresent: Boolean(senderProfileImageUrl),
        profileLookupAttempted: diag?.profileLookupAttempted ?? false,
        profileLookupSucceeded: diag?.profileLookupSucceeded ?? false,
        hasImageUrl: Boolean(normalized.mediaUrl),
        messageId: normalized.externalMessageId,
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
