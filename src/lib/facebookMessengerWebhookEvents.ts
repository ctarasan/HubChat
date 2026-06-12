import { parseMetaTimestamp } from "../domain/dateUtils.js";
import { isFacebookPageSelfComment } from "./facebookPageSelfComment.js";

export type FacebookMessengerWebhookAttachment = {
  type: string | null;
  url: string | null;
};

export type FacebookMessengerInboundNormalized = {
  kind: "inbound_messenger";
  externalEventId: string;
  idempotencyKey: string;
  externalMessageId: string;
  externalUserId: string;
  channelThreadId: string;
  text: string;
  occurredAt: string;
  messageType: "TEXT" | "IMAGE";
  mediaUrl: string | null;
  previewUrl: string | null;
  facebookPageId: string | null;
};

export type FacebookMessengerEchoNormalized = {
  kind: "message_echo";
  externalEventId: string;
  idempotencyKey: string;
  externalMessageId: string;
  customerPsid: string;
  channelThreadId: string;
  text: string;
  occurredAt: string;
  messageType: "TEXT" | "IMAGE";
  mediaUrl: string | null;
  previewUrl: string | null;
  facebookPageId: string | null;
};

export type FacebookMessengerWebhookEvent = FacebookMessengerInboundNormalized | FacebookMessengerEchoNormalized;

type MessagingEntry = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
  delivery?: unknown;
  read?: unknown;
  reaction?: unknown;
};

function pickHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return null;
  return trimmed;
}

function pickText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type MessagingAttachment = { type?: string; payload?: { url?: string } };

function parseAttachment(attachments: MessagingAttachment[] | undefined): FacebookMessengerWebhookAttachment {
  const first = attachments?.[0];
  const type = typeof first?.type === "string" ? first.type.trim().toLowerCase() : null;
  const url = pickHttpsUrl(first?.payload?.url);
  return { type, url };
}

function requireMid(mid: unknown): string | null {
  if (typeof mid !== "string") return null;
  const trimmed = mid.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isNonMessageMessengerEvent(msg: MessagingEntry): boolean {
  return Boolean(msg.delivery || msg.read || msg.reaction);
}

export function parseFacebookMessengerWebhookEvents(input: {
  entry: Array<{ id?: string; messaging?: unknown[] }>;
  pageId?: string | null;
}): FacebookMessengerWebhookEvent[] {
  const events: FacebookMessengerWebhookEvent[] = [];
  const configuredPageId = typeof input.pageId === "string" ? input.pageId.trim() : "";

  for (const entry of input.entry ?? []) {
    const receivingPageId = (typeof entry.id === "string" && entry.id.trim()) || configuredPageId || null;

    for (const msg of (entry.messaging ?? []) as MessagingEntry[]) {
      if (!msg.message || isNonMessageMessengerEvent(msg)) continue;

      const mid = requireMid(msg.message.mid);
      if (!mid) continue;

      const timestamp = msg.timestamp ?? Date.now();
      const occurredAt = parseMetaTimestamp(timestamp);
      const attachment = parseAttachment(msg.message.attachments);
      const textValue = pickText(msg.message.text);
      const messageType = attachment.type === "image" && attachment.url ? "IMAGE" : "TEXT";
      const text = textValue || (messageType === "IMAGE" ? "" : "");
      if (!text && messageType !== "IMAGE") continue;

      if (msg.message.is_echo) {
        const customerPsid = typeof msg.recipient?.id === "string" ? msg.recipient.id.trim() : "";
        if (!customerPsid) continue;
        events.push({
          kind: "message_echo",
          externalEventId: mid,
          idempotencyKey: `facebook:echo:${mid}`,
          externalMessageId: mid,
          customerPsid,
          channelThreadId: customerPsid,
          text,
          occurredAt,
          messageType,
          mediaUrl: messageType === "IMAGE" ? attachment.url : null,
          previewUrl: messageType === "IMAGE" ? attachment.url : null,
          facebookPageId: receivingPageId
        });
        continue;
      }

      const senderId = typeof msg.sender?.id === "string" ? msg.sender.id.trim() : "";
      if (!senderId) continue;
      if (isFacebookPageSelfComment({ commenterId: senderId, receivingPageId })) continue;

      events.push({
        kind: "inbound_messenger",
        externalEventId: mid,
        idempotencyKey: `facebook:${mid}`,
        externalMessageId: mid,
        externalUserId: senderId,
        channelThreadId: senderId,
        text: text || (messageType === "IMAGE" ? "" : `[${attachment.type ?? "attachment"}]`),
        occurredAt,
        messageType,
        mediaUrl: messageType === "IMAGE" ? attachment.url : null,
        previewUrl: messageType === "IMAGE" ? attachment.url : null,
        facebookPageId: receivingPageId
      });
    }
  }

  return events;
}
