import type {
  MarketingTimelineGroup,
  MarketingTimelineItemViewModel,
  MarketingTimelineTone
} from "./marketingTimelineModel.js";

/** UI-layer record shape returned by GET /api/marketing-events (camelCase from API). */
export type MarketingEventApiRecord = {
  id: string;
  tenantId?: string;
  leadId?: string | null;
  conversationId?: string | null;
  channel?: string | null;
  eventType: string;
  occurredAt: string;
  actorType: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type MarketingEventsPageInfo = {
  nextCursor: string | null;
  hasNextPage: boolean;
};

export const MARKETING_EVENTS_DEFAULT_LIMIT = 15;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const METADATA_SKIP_KEYS = new Set([
  "messagebody",
  "message_body",
  "body",
  "text",
  "content",
  "mediaurl",
  "media_url",
  "imageurl",
  "image_url",
  "attachmenturl",
  "attachment_url",
  "previewurl",
  "preview_url",
  "providerpayload",
  "provider_payload",
  "payload",
  "raw"
]);

const EVENT_TITLES: Record<string, string> = {
  LEAD_CREATED: "Lead created",
  LEAD_STATUS_CHANGED: "Lead status changed",
  CONVERSATION_CREATED: "Conversation opened",
  CONVERSATION_STATUS_CHANGED: "Conversation status changed",
  CUSTOMER_MESSAGE_RECEIVED: "Customer message received",
  AGENT_MESSAGE_SENT: "Agent message sent",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  FOLLOW_UP_CLEARED: "Follow-up cleared",
  SLA_DUE_SET: "SLA due set",
  SLA_CLEARED: "SLA cleared"
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function readConversationLeadId(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const raw = row.leadId ?? row.lead_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return isUuid(trimmed) ? trimmed : null;
}

export function buildMarketingEventsListPath(input: {
  conversationId: string;
  leadId?: string | null;
  cursor?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  params.set("conversationId", input.conversationId.trim());
  const leadId = input.leadId?.trim();
  if (leadId && isUuid(leadId)) {
    params.set("leadId", leadId);
  }
  const limit = input.limit ?? MARKETING_EVENTS_DEFAULT_LIMIT;
  params.set("limit", String(limit));
  const cursor = input.cursor?.trim();
  if (cursor) params.set("cursor", cursor);
  return `/api/marketing-events?${params.toString()}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function normalizeMarketingEventApiRecord(raw: unknown): MarketingEventApiRecord | null {
  if (!isRecord(raw)) return null;
  const id = readString(raw.id);
  const eventType = readString(raw.eventType ?? raw.event_type).toUpperCase();
  const occurredAt = readString(raw.occurredAt ?? raw.occurred_at);
  if (!id || !eventType || !occurredAt) return null;
  const actorType = readString(raw.actorType ?? raw.actor_type).toUpperCase() || "SYSTEM";
  return {
    id,
    tenantId: readString(raw.tenantId ?? raw.tenant_id) || undefined,
    leadId: raw.leadId === null || raw.lead_id === null ? null : readString(raw.leadId ?? raw.lead_id) || null,
    conversationId:
      raw.conversationId === null || raw.conversation_id === null
        ? null
        : readString(raw.conversationId ?? raw.conversation_id) || null,
    channel: raw.channel == null ? null : readString(raw.channel) || null,
    eventType,
    occurredAt,
    actorType,
    actorUserId:
      raw.actorUserId === null || raw.actor_user_id === null
        ? null
        : readString(raw.actorUserId ?? raw.actor_user_id) || null,
    metadata: isRecord(raw.metadata)
      ? raw.metadata
      : isRecord(raw.metadata_json)
        ? raw.metadata_json
        : isRecord(raw.metadataJson)
          ? raw.metadataJson
          : {},
    createdAt: readString(raw.createdAt ?? raw.created_at) || undefined
  };
}

export function parseMarketingEventsListResponse(body: unknown):
  | { ok: true; items: MarketingEventApiRecord[]; pageInfo: MarketingEventsPageInfo }
  | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Invalid marketing events response." };
  const data = body.data;
  if (!Array.isArray(data)) return { ok: false, error: "Invalid marketing events response: missing data." };
  const items: MarketingEventApiRecord[] = [];
  for (const row of data) {
    const normalized = normalizeMarketingEventApiRecord(row);
    if (normalized) items.push(normalized);
  }
  const pageInfoRaw = isRecord(body.pageInfo) ? body.pageInfo : isRecord(body.page_info) ? body.page_info : null;
  const nextCursor =
    pageInfoRaw && typeof pageInfoRaw.nextCursor === "string"
      ? pageInfoRaw.nextCursor.trim() || null
      : pageInfoRaw && typeof pageInfoRaw.next_cursor === "string"
        ? pageInfoRaw.next_cursor.trim() || null
        : null;
  const hasNextPage = pageInfoRaw?.hasNextPage === true || pageInfoRaw?.has_next_page === true || nextCursor != null;
  return { ok: true, items, pageInfo: { nextCursor, hasNextPage } };
}

export function mapMarketingEventsHttpError(status: number, body: unknown): string {
  if (status === 403) {
    return "You do not have permission to view marketing signals for this conversation.";
  }
  if (status === 404) {
    return "Conversation or lead was not found.";
  }
  if (status === 401) {
    return "Sign in required to view marketing signals.";
  }
  if (isRecord(body)) {
    const msg = readString(body.error ?? body.detail ?? body.message);
    if (msg) return msg;
  }
  return `Could not load marketing signals (HTTP ${status}).`;
}

export async function fetchMarketingEventsList(input: {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  conversationId: string;
  leadId?: string | null;
  cursor?: string | null;
  limit?: number;
}): Promise<
  | { ok: true; items: MarketingEventApiRecord[]; pageInfo: MarketingEventsPageInfo }
  | { ok: false; status: number; errorMessage: string }
> {
  const path = buildMarketingEventsListPath({
    conversationId: input.conversationId,
    leadId: input.leadId,
    cursor: input.cursor,
    limit: input.limit
  });
  const res = await fetch(`${input.baseUrl.replace(/\/$/, "")}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "x-tenant-id": input.tenantId
    }
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, errorMessage: mapMarketingEventsHttpError(res.status, body) };
  }
  const parsed = parseMarketingEventsListResponse(body);
  if (!parsed.ok) {
    return { ok: false, status: res.status, errorMessage: parsed.error };
  }
  return { ok: true, items: parsed.items, pageInfo: parsed.pageInfo };
}

export function mapMarketingEventTypeToGroup(eventType: string): MarketingTimelineGroup {
  switch (eventType) {
    case "LEAD_CREATED":
    case "LEAD_STATUS_CHANGED":
      return "lead";
    case "CONVERSATION_CREATED":
    case "CONVERSATION_STATUS_CHANGED":
      return "conversation";
    case "CUSTOMER_MESSAGE_RECEIVED":
    case "AGENT_MESSAGE_SENT":
      return "message";
    case "FOLLOW_UP_SCHEDULED":
    case "FOLLOW_UP_CLEARED":
      return "follow_up";
    case "SLA_DUE_SET":
    case "SLA_CLEARED":
      return "sla";
    default:
      return "system";
  }
}

export function mapMarketingEventTypeToTone(eventType: string): MarketingTimelineTone {
  switch (eventType) {
    case "LEAD_CREATED":
    case "CONVERSATION_CREATED":
      return "info";
    case "AGENT_MESSAGE_SENT":
    case "FOLLOW_UP_CLEARED":
    case "SLA_CLEARED":
      return "success";
    case "SLA_DUE_SET":
    case "FOLLOW_UP_SCHEDULED":
      return "warn";
    case "LEAD_STATUS_CHANGED":
    case "CONVERSATION_STATUS_CHANGED":
      return "accent";
    default:
      return "neutral";
  }
}

function formatActorLabel(actorType: string, actorUserId: string | null | undefined): string {
  switch (actorType.toUpperCase()) {
    case "CUSTOMER":
      return "Customer";
    case "AGENT":
      return actorUserId ? "Agent" : "Agent";
    case "SYSTEM":
    default:
      return "System";
  }
}

function metadataValueToDisplay(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return null;
    if (t.length > 80) return `${t.slice(0, 77)}…`;
    return t;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function formatSafeMarketingMetadataSummary(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  const parts: string[] = [];
  const preferredKeys = ["from", "to", "status", "previousStatus", "nextStatus", "note", "type", "reason"];
  for (const key of preferredKeys) {
    if (METADATA_SKIP_KEYS.has(key.toLowerCase())) continue;
    const display = metadataValueToDisplay(metadata[key]);
    if (display) parts.push(`${key}: ${display}`);
  }
  if (parts.length === 0) {
    for (const [key, value] of Object.entries(metadata)) {
      if (METADATA_SKIP_KEYS.has(key.toLowerCase())) continue;
      const display = metadataValueToDisplay(value);
      if (display) {
        parts.push(`${key}: ${display}`);
        if (parts.length >= 3) break;
      }
    }
  }
  return parts.length ? parts.join(" · ") : undefined;
}

export function mapMarketingEventToTimelineItem(record: MarketingEventApiRecord): MarketingTimelineItemViewModel {
  const eventType = record.eventType.toUpperCase();
  const title = EVENT_TITLES[eventType] ?? eventType.replace(/_/g, " ").toLowerCase();
  const metadataSummary = formatSafeMarketingMetadataSummary(record.metadata);
  let description: string | undefined;
  if (eventType === "CUSTOMER_MESSAGE_RECEIVED" || eventType === "AGENT_MESSAGE_SENT") {
    description = "Message activity recorded (content not shown).";
  } else if (eventType === "LEAD_STATUS_CHANGED" || eventType === "CONVERSATION_STATUS_CHANGED") {
    description = metadataSummary ? undefined : "Status change recorded.";
  }
  return {
    id: record.id,
    group: mapMarketingEventTypeToGroup(eventType),
    title,
    description,
    occurredAt: record.occurredAt,
    actorLabel: formatActorLabel(record.actorType, record.actorUserId ?? null),
    channelLabel: record.channel?.trim() || "HubChat",
    tone: mapMarketingEventTypeToTone(eventType),
    metadataSummary
  };
}

export function mergeMarketingTimelineItems(
  existing: MarketingTimelineItemViewModel[],
  incoming: MarketingTimelineItemViewModel[]
): MarketingTimelineItemViewModel[] {
  const seen = new Set(existing.map((i) => i.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
