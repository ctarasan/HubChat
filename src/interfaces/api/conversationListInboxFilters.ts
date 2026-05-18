import { z } from "zod";
import { DEFAULT_SLA_DUE_SOON_MS } from "../../domain/conversationInboxBuckets.js";
import type { LeadStatus } from "../../domain/entities.js";

/** Lead statuses exposed on Team Inbox list filter (subset of domain). */
export const CONVERSATION_LIST_LEAD_STATUS_VALUES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "WON",
  "LOST"
] as const satisfies readonly LeadStatus[];

export type ConversationListLeadStatusParam = (typeof CONVERSATION_LIST_LEAD_STATUS_VALUES)[number];

export const CONVERSATION_LIST_FOLLOW_UP_VALUES = ["has", "overdue", "today"] as const;
export type ConversationListFollowUpParam = (typeof CONVERSATION_LIST_FOLLOW_UP_VALUES)[number];

export const CONVERSATION_LIST_SLA_VALUES = ["has", "overdue", "due_soon"] as const;
export type ConversationListSlaParam = (typeof CONVERSATION_LIST_SLA_VALUES)[number];

export type ConversationListInboxFilters = {
  leadStatus?: ConversationListLeadStatusParam;
  followUp?: ConversationListFollowUpParam;
  sla?: ConversationListSlaParam;
};

export const ConversationListInboxFiltersQuerySchema = z.object({
  leadStatus: z.enum(CONVERSATION_LIST_LEAD_STATUS_VALUES).optional(),
  followUp: z.enum(CONVERSATION_LIST_FOLLOW_UP_VALUES).optional(),
  sla: z.enum(CONVERSATION_LIST_SLA_VALUES).optional()
});

export function parseConversationListInboxFilters(
  data: z.infer<typeof ConversationListInboxFiltersQuerySchema>
): ConversationListInboxFilters | undefined {
  const out: ConversationListInboxFilters = {};
  if (data.leadStatus) out.leadStatus = data.leadStatus;
  if (data.followUp) out.followUp = data.followUp;
  if (data.sla) out.sla = data.sla;
  return Object.keys(out).length > 0 ? out : undefined;
}

export type UtcInboxFilterClock = {
  nowIso: string;
  dayStartIso: string;
  dayEndIso: string;
  slaDueSoonEndIso: string;
};

export function utcInboxFilterClock(now: Date = new Date()): UtcInboxFilterClock {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const nowIso = now.toISOString();
  return {
    nowIso,
    dayStartIso: dayStart.toISOString(),
    dayEndIso: dayEnd.toISOString(),
    slaDueSoonEndIso: new Date(now.getTime() + DEFAULT_SLA_DUE_SOON_MS).toISOString()
  };
}

/** Supabase PostgREST filter steps for inbox urgency filters (testable). */
export type InboxFilterQueryStep =
  | { kind: "lead_status"; value: string }
  | { kind: "follow_up_has" }
  | { kind: "follow_up_overdue"; beforeIso: string }
  | { kind: "follow_up_today"; fromIso: string; toIso: string; minIso: string }
  | { kind: "sla_has" }
  | { kind: "sla_overdue"; beforeIso: string }
  | { kind: "sla_due_soon"; afterIso: string; beforeIso: string };

export function buildInboxFilterQuerySteps(
  filters: ConversationListInboxFilters | undefined,
  clock: UtcInboxFilterClock = utcInboxFilterClock()
): InboxFilterQueryStep[] {
  if (!filters) return [];
  const steps: InboxFilterQueryStep[] = [];
  if (filters.leadStatus) {
    steps.push({ kind: "lead_status", value: filters.leadStatus });
  }
  if (filters.followUp === "has") {
    steps.push({ kind: "follow_up_has" });
  } else if (filters.followUp === "overdue") {
    steps.push({ kind: "follow_up_overdue", beforeIso: clock.nowIso });
  } else if (filters.followUp === "today") {
    steps.push({
      kind: "follow_up_today",
      fromIso: clock.dayStartIso,
      toIso: clock.dayEndIso,
      minIso: clock.nowIso
    });
  }
  if (filters.sla === "has") {
    steps.push({ kind: "sla_has" });
  } else if (filters.sla === "overdue") {
    steps.push({ kind: "sla_overdue", beforeIso: clock.nowIso });
  } else if (filters.sla === "due_soon") {
    steps.push({ kind: "sla_due_soon", afterIso: clock.nowIso, beforeIso: clock.slaDueSoonEndIso });
  }
  return steps;
}

export type InboxFilterQueryApplier = {
  not(column: string, operator: string, value: unknown): InboxFilterQueryApplier;
  lt(column: string, value: string): InboxFilterQueryApplier;
  lte(column: string, value: string): InboxFilterQueryApplier;
  gt(column: string, value: string): InboxFilterQueryApplier;
  gte(column: string, value: string): InboxFilterQueryApplier;
  filter(column: string, operator: string, value: string): InboxFilterQueryApplier;
};

export function applyInboxFilterQuerySteps<T extends InboxFilterQueryApplier>(
  q: T,
  steps: InboxFilterQueryStep[]
): T {
  let cur = q;
  for (const step of steps) {
    if (step.kind === "lead_status") {
      cur = cur.filter("leads.status", "eq", step.value) as T;
    } else if (step.kind === "follow_up_has") {
      cur = cur.not("follow_up_at", "is", null) as T;
    } else if (step.kind === "follow_up_overdue") {
      cur = cur.not("follow_up_at", "is", null).lt("follow_up_at", step.beforeIso) as T;
    } else if (step.kind === "follow_up_today") {
      cur = cur
        .not("follow_up_at", "is", null)
        .gte("follow_up_at", step.fromIso)
        .lt("follow_up_at", step.toIso)
        .gte("follow_up_at", step.minIso) as T;
    } else if (step.kind === "sla_has") {
      cur = cur.not("sla_due_at", "is", null) as T;
    } else if (step.kind === "sla_overdue") {
      cur = cur.not("sla_due_at", "is", null).lt("sla_due_at", step.beforeIso) as T;
    } else if (step.kind === "sla_due_soon") {
      cur = cur
        .not("sla_due_at", "is", null)
        .gt("sla_due_at", step.afterIso)
        .lte("sla_due_at", step.beforeIso) as T;
    }
  }
  return cur;
}
