/**
 * UI-local display model for the Marketing Timeline panel (Phase II-M1-B1).
 * Not the backend DTO — map via marketingTimelineApi.ts from GET /api/marketing-events.
 */

export const MARKETING_TIMELINE_GROUPS = [
  "lead",
  "conversation",
  "message",
  "follow_up",
  "sla",
  "system"
] as const;

export type MarketingTimelineGroup = (typeof MARKETING_TIMELINE_GROUPS)[number];

export type MarketingTimelineTone = "neutral" | "info" | "success" | "warn" | "accent";

export type MarketingTimelineItemViewModel = {
  id: string;
  group: MarketingTimelineGroup;
  title: string;
  description?: string;
  occurredAt: string;
  actorLabel: string;
  channelLabel: string;
  tone?: MarketingTimelineTone;
  metadataSummary?: string;
};

export type MarketingTimelineDateGroup = {
  dateKey: string;
  dateLabel: string;
  items: MarketingTimelineItemViewModel[];
};

export const MARKETING_TIMELINE_GROUP_LABELS: Record<MarketingTimelineGroup, string> = {
  lead: "Lead",
  conversation: "Conversation",
  message: "Message",
  follow_up: "Follow-up",
  sla: "SLA",
  system: "System"
};

export const MARKETING_TIMELINE_GROUP_MARKERS: Record<MarketingTimelineGroup, string> = {
  lead: "LD",
  conversation: "CV",
  message: "MS",
  follow_up: "FU",
  sla: "SL",
  system: "SY"
};

const FORBIDDEN_METADATA_KEYS = [
  "messageBody",
  "message_body",
  "mediaUrl",
  "media_url",
  "providerPayload",
  "provider_payload",
  "body",
  "attachmentUrl",
  "attachment_url"
] as const;

export function parseMarketingTimelineOccurredAt(iso: string): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMarketingTimelineTime(iso: string): string {
  const d = parseMarketingTimelineOccurredAt(iso);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatMarketingTimelineDateLabel(iso: string, now: Date = new Date()): string {
  const d = parseMarketingTimelineOccurredAt(iso);
  if (!d) return "Unknown date";
  const day = startOfLocalDay(d).getTime();
  const today = startOfLocalDay(now).getTime();
  const oneDay = 86_400_000;
  if (day === today) return "Today";
  if (day === today - oneDay) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function sortMarketingTimelineItemsDesc(
  items: MarketingTimelineItemViewModel[]
): MarketingTimelineItemViewModel[] {
  return [...items].sort((a, b) => {
    const ta = parseMarketingTimelineOccurredAt(a.occurredAt)?.getTime() ?? 0;
    const tb = parseMarketingTimelineOccurredAt(b.occurredAt)?.getTime() ?? 0;
    return tb - ta;
  });
}

export function filterMarketingTimelineByGroups(
  items: MarketingTimelineItemViewModel[],
  selectedGroups: ReadonlySet<MarketingTimelineGroup>
): MarketingTimelineItemViewModel[] {
  if (selectedGroups.size === 0) return items;
  return items.filter((item) => selectedGroups.has(item.group));
}

export function groupMarketingTimelineItemsByDate(
  items: MarketingTimelineItemViewModel[],
  now: Date = new Date()
): MarketingTimelineDateGroup[] {
  const sorted = sortMarketingTimelineItemsDesc(items);
  const buckets = new Map<string, MarketingTimelineItemViewModel[]>();
  const labelByKey = new Map<string, string>();

  for (const item of sorted) {
    const d = parseMarketingTimelineOccurredAt(item.occurredAt);
    const dateKey = d ? startOfLocalDay(d).toISOString().slice(0, 10) : "unknown";
    const dateLabel = formatMarketingTimelineDateLabel(item.occurredAt, now);
    if (!buckets.has(dateKey)) {
      buckets.set(dateKey, []);
      labelByKey.set(dateKey, dateLabel);
    }
    buckets.get(dateKey)!.push(item);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dateKey, groupItems]) => ({
      dateKey,
      dateLabel: labelByKey.get(dateKey) ?? dateKey,
      items: groupItems
    }));
}

export function timelineItemHasForbiddenPayloadFields(item: MarketingTimelineItemViewModel): boolean {
  const record = item as Record<string, unknown>;
  return FORBIDDEN_METADATA_KEYS.some((key) => key in record);
}

export function assertMarketingTimelineFixturesAreSafe(items: MarketingTimelineItemViewModel[]): boolean {
  return items.every((item) => !timelineItemHasForbiddenPayloadFields(item));
}

/** Compact demo fixture for shell tests and Storybook-style manual wiring in M1-B2. */
export const MOCK_MARKETING_TIMELINE_DEMO_ITEMS: MarketingTimelineItemViewModel[] = [
  {
    id: "mt-demo-1",
    group: "lead",
    title: "Lead captured",
    description: "Inbound form submission linked to conversation.",
    occurredAt: "2026-05-20T09:12:00.000Z",
    actorLabel: "System",
    channelLabel: "Web",
    tone: "info",
    metadataSummary: "Source: landing-page"
  },
  {
    id: "mt-demo-2",
    group: "conversation",
    title: "Conversation opened",
    description: "Thread started from LINE channel.",
    occurredAt: "2026-05-20T09:18:00.000Z",
    actorLabel: "Customer",
    channelLabel: "LINE",
    tone: "neutral",
    metadataSummary: "Status: open"
  },
  {
    id: "mt-demo-3",
    group: "message",
    title: "Agent reply sent",
    description: "Outbound message recorded (preview omitted).",
    occurredAt: "2026-05-20T10:02:00.000Z",
    actorLabel: "Ploy T.",
    channelLabel: "LINE",
    tone: "success",
    metadataSummary: "Type: text"
  },
  {
    id: "mt-demo-4",
    group: "follow_up",
    title: "Follow-up scheduled",
    occurredAt: "2026-05-19T15:30:00.000Z",
    actorLabel: "Manager",
    channelLabel: "HubChat",
    tone: "accent",
    metadataSummary: "Due: May 21"
  },
  {
    id: "mt-demo-5",
    group: "sla",
    title: "SLA due soon",
    occurredAt: "2026-05-19T11:00:00.000Z",
    actorLabel: "System",
    channelLabel: "HubChat",
    tone: "warn",
    metadataSummary: "Window: 2h"
  },
  {
    id: "mt-demo-6",
    group: "system",
    title: "Assignment updated",
    occurredAt: "2026-05-18T08:45:00.000Z",
    actorLabel: "Admin",
    channelLabel: "HubChat",
    tone: "neutral",
    metadataSummary: "Agent: sales-42"
  }
];
