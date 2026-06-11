/** LINE webhook events that must not create inbox conversations or inbound messages. */
const LINE_NON_MESSAGE_EVENT_TYPES = new Set([
  "follow",
  "unfollow",
  "join",
  "leave",
  "memberJoined",
  "memberLeft",
  "beacon",
  "accountLink",
  "things",
  "postback"
]);

/** LINE message payloads that represent real customer content for inbox ingest. */
const LINE_CUSTOMER_MESSAGE_TYPES = new Set([
  "text",
  "image",
  "sticker",
  "file",
  "audio",
  "video",
  "location"
]);

export type LineWebhookEvent = {
  type?: string;
  message?: { type?: string };
};

export function getFirstLineWebhookEvent(payload: { events?: unknown[] }): LineWebhookEvent | null {
  const first = payload.events?.[0];
  if (!first || typeof first !== "object") return null;
  return first as LineWebhookEvent;
}

export function isLineCustomerMessageWebhookEvent(event: LineWebhookEvent | null | undefined): boolean {
  if (!event || event.type !== "message") return false;
  const messageType = String(event.message?.type ?? "").trim().toLowerCase();
  return LINE_CUSTOMER_MESSAGE_TYPES.has(messageType);
}

export function isLineNonMessageWebhookEvent(event: LineWebhookEvent | null | undefined): boolean {
  if (!event) return true;
  const eventType = String(event.type ?? "").trim();
  if (eventType === "message") {
    const messageType = String(event.message?.type ?? "").trim().toLowerCase();
    return !LINE_CUSTOMER_MESSAGE_TYPES.has(messageType);
  }
  return LINE_NON_MESSAGE_EVENT_TYPES.has(eventType) || eventType.length === 0;
}
