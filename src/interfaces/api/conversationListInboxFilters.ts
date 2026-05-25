import { z } from "zod";
import { DEFAULT_SLA_DUE_SOON_MS } from "../../domain/conversationInboxBuckets.js";
import type { LeadManagementStatus } from "../../domain/leadManagementStatus.js";
import { LEAD_MANAGEMENT_STATUSES } from "../../domain/leadManagementStatus.js";

/** Frozen GET /api/conversations channel filter (Dashboard Manager UX). */
export const CONVERSATION_LIST_CHANNEL_VALUES = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type ConversationListChannelParam = (typeof CONVERSATION_LIST_CHANNEL_VALUES)[number];

/** Frozen conversation lifecycle filter. */
export const CONVERSATION_LIST_CONVERSATION_STATUS_VALUES = ["OPEN", "PENDING", "RESOLVED"] as const;
export type ConversationListConversationStatusParam =
  (typeof CONVERSATION_LIST_CONVERSATION_STATUS_VALUES)[number];

/** Frozen lead management filter (maps to `leads.status` + follow-up in repository). */
export const CONVERSATION_LIST_LEAD_MANAGEMENT_STATUS_VALUES = [
  "NEW",
  "IN_PROGRESS",
  "FOLLOW_UP",
  "WON",
  "LOST",
  "CLOSED"
] as const satisfies readonly LeadManagementStatus[];
export type ConversationListLeadManagementStatusParam =
  (typeof CONVERSATION_LIST_LEAD_MANAGEMENT_STATUS_VALUES)[number];

/** @deprecated Phase II-D2 pre-contract; accepted as aliases only. */
export const LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "WON",
  "LOST"
] as const;

export const CONVERSATION_LIST_FOLLOW_UP_VALUES = [
  "all",
  "scheduled",
  "today",
  "overdue",
  "none"
] as const;
export type ConversationListFollowUpParam =
  | (typeof CONVERSATION_LIST_FOLLOW_UP_VALUES)[number]
  | "has";

export const CONVERSATION_LIST_SLA_VALUES = ["all", "active", "due_soon", "overdue", "none"] as const;
export type ConversationListSlaParam = (typeof CONVERSATION_LIST_SLA_VALUES)[number] | "has";

export const CONVERSATION_LIST_WAITING_VALUES = ["all", "needs_response", "waiting_customer"] as const;
export type ConversationListWaitingParam = (typeof CONVERSATION_LIST_WAITING_VALUES)[number];

export type ConversationListInboxFilters = {
  leadManagementStatus?: ConversationListLeadManagementStatusParam;
  followUp?: ConversationListFollowUpParam;
  sla?: ConversationListSlaParam;
  waiting?: ConversationListWaitingParam;
};

const LegacyFollowUpAlias = z.enum(["has", "overdue", "today"]);
const LegacySlaAlias = z.enum(["has", "overdue", "due_soon"]);

export const ConversationsListQuerySchema = z
  .object({
    scope: z.enum(["all", "unassigned", "mine", "team", "assigned_to_me"]).optional(),
    channel: z.enum(CONVERSATION_LIST_CHANNEL_VALUES).optional(),
    conversationStatus: z.enum(CONVERSATION_LIST_CONVERSATION_STATUS_VALUES).optional(),
    /** @deprecated use conversationStatus */
    status: z.enum(["OPEN", "PENDING", "CLOSED", "RESOLVED", "ARCHIVED"]).optional(),
    leadManagementStatus: z.enum(CONVERSATION_LIST_LEAD_MANAGEMENT_STATUS_VALUES).optional(),
    /** @deprecated use leadManagementStatus */
    leadStatus: z.enum(LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES).optional(),
    followUp: z.union([z.enum(CONVERSATION_LIST_FOLLOW_UP_VALUES), LegacyFollowUpAlias]).optional(),
    sla: z.union([z.enum(CONVERSATION_LIST_SLA_VALUES), LegacySlaAlias]).optional(),
    waiting: z.enum(CONVERSATION_LIST_WAITING_VALUES).optional(),
    assignedAgentId: z.string().uuid().optional(),
    /** @deprecated use assignedAgentId */
    assignedSalesId: z.string().uuid().optional(),
    cursor: z.string().optional(),
    limit: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.leadManagementStatus && data.leadStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either leadManagementStatus or leadStatus, not both."
      });
    }
    if (data.conversationStatus && data.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either conversationStatus or status, not both."
      });
    }
    if (data.assignedAgentId && data.assignedSalesId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either assignedAgentId or assignedSalesId, not both."
      });
    }
  });

export type ConversationsListQuery = z.infer<typeof ConversationsListQuerySchema>;

import type { ConversationListScopeParam } from "./conversationListScope.js";

export type ParsedConversationsListQuery = {
  scope?: ConversationListScopeParam;
  channel?: ConversationListChannelParam;
  conversationStatus?: string;
  assignedAgentId?: string;
  cursor?: string;
  limit?: string;
  inboxFilters?: ConversationListInboxFilters;
};

function normalizeScope(scope: ConversationsListQuery["scope"]): ParsedConversationsListQuery["scope"] {
  if (scope === "assigned_to_me") return "mine";
  return scope;
}

function normalizeFollowUp(
  value: ConversationsListQuery["followUp"]
): ConversationListFollowUpParam | undefined {
  if (!value) return undefined;
  if (value === "has") return "scheduled";
  return value;
}

function normalizeSla(value: ConversationsListQuery["sla"]): ConversationListSlaParam | undefined {
  if (!value) return undefined;
  if (value === "has") return "active";
  return value;
}

function legacyLeadStatusToManagement(
  legacy: (typeof LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES)[number]
): ConversationListLeadManagementStatusParam {
  if (legacy === "NEW") return "NEW";
  if (legacy === "WON") return "WON";
  if (legacy === "LOST") return "LOST";
  return "IN_PROGRESS";
}

function resolveConversationStatus(data: ConversationsListQuery): string | undefined {
  if (data.conversationStatus) return data.conversationStatus;
  if (data.status) return data.status;
  return undefined;
}

function resolveLeadManagementStatus(
  data: ConversationsListQuery
): ConversationListLeadManagementStatusParam | undefined {
  if (data.leadManagementStatus) return data.leadManagementStatus;
  if (data.leadStatus) return legacyLeadStatusToManagement(data.leadStatus);
  return undefined;
}

export function parseConversationListInboxFilters(
  filters: ConversationListInboxFilters | undefined
): ConversationListInboxFilters | undefined {
  if (!filters) return undefined;
  const out: ConversationListInboxFilters = {};
  if (filters.leadManagementStatus) out.leadManagementStatus = filters.leadManagementStatus;
  if (filters.followUp && filters.followUp !== "all" && filters.followUp !== "none") {
    out.followUp = filters.followUp;
  }
  if (filters.sla && filters.sla !== "all" && filters.sla !== "none") {
    out.sla = filters.sla;
  }
  if (filters.waiting && filters.waiting !== "all") out.waiting = filters.waiting;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildConversationListInboxFilters(data: {
  leadManagementStatus?: ConversationListLeadManagementStatusParam;
  followUp?: ConversationListFollowUpParam;
  sla?: ConversationListSlaParam;
  waiting?: ConversationListWaitingParam;
}): ConversationListInboxFilters | undefined {
  return parseConversationListInboxFilters({
    leadManagementStatus: data.leadManagementStatus,
    followUp: data.followUp,
    sla: data.sla,
    waiting: data.waiting
  });
}

export function parseConversationsListQuery(
  qs: Record<string, string>
): { ok: true; value: ParsedConversationsListQuery } | { ok: false; message: string } {
  const parsed = ConversationsListQuerySchema.safeParse(qs);
  if (!parsed.success) return { ok: false, message: parsed.error.message };

  const data = parsed.data;
  const inboxFilters = buildConversationListInboxFilters({
    leadManagementStatus: resolveLeadManagementStatus(data),
    followUp: normalizeFollowUp(data.followUp),
    sla: normalizeSla(data.sla),
    waiting: data.waiting
  });

  return {
    ok: true,
    value: {
      scope: normalizeScope(data.scope),
      channel: data.channel,
      conversationStatus: resolveConversationStatus(data),
      assignedAgentId: data.assignedAgentId ?? data.assignedSalesId,
      cursor: data.cursor,
      limit: data.limit,
      inboxFilters
    }
  };
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

/** Supabase PostgREST filter steps for inbox list filters (testable). */
export type InboxFilterQueryStep =
  | { kind: "lead_management_status"; value: ConversationListLeadManagementStatusParam }
  | { kind: "follow_up_scheduled" }
  | { kind: "follow_up_none" }
  | { kind: "follow_up_overdue"; beforeIso: string }
  | { kind: "follow_up_today"; fromIso: string; toIso: string; minIso: string }
  | { kind: "sla_active" }
  | { kind: "sla_none" }
  | { kind: "sla_overdue"; beforeIso: string }
  | { kind: "sla_due_soon"; afterIso: string; beforeIso: string }
  | { kind: "waiting_needs_response" }
  | { kind: "waiting_customer" };

const IN_PROGRESS_LEAD_STATUSES_CSV = "ASSIGNED,CONTACTED,QUALIFIED,PROPOSAL_SENT,NEGOTIATION";

export function buildInboxFilterQuerySteps(
  filters: ConversationListInboxFilters | undefined,
  clock: UtcInboxFilterClock = utcInboxFilterClock()
): InboxFilterQueryStep[] {
  if (!filters) return [];
  const steps: InboxFilterQueryStep[] = [];

  if (filters.leadManagementStatus) {
    steps.push({ kind: "lead_management_status", value: filters.leadManagementStatus });
  }

  if (filters.followUp === "scheduled") {
    steps.push({ kind: "follow_up_scheduled" });
  } else if (filters.followUp === "none") {
    steps.push({ kind: "follow_up_none" });
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

  if (filters.sla === "active") {
    steps.push({ kind: "sla_active" });
  } else if (filters.sla === "none") {
    steps.push({ kind: "sla_none" });
  } else if (filters.sla === "overdue") {
    steps.push({ kind: "sla_overdue", beforeIso: clock.nowIso });
  } else if (filters.sla === "due_soon") {
    steps.push({ kind: "sla_due_soon", afterIso: clock.nowIso, beforeIso: clock.slaDueSoonEndIso });
  }

  if (filters.waiting === "needs_response") {
    steps.push({ kind: "waiting_needs_response" });
  } else if (filters.waiting === "waiting_customer") {
    steps.push({ kind: "waiting_customer" });
  }

  return steps;
}

export type InboxFilterQueryApplier = {
  not(column: string, operator: string, value: unknown): InboxFilterQueryApplier;
  is(column: string, value: null): InboxFilterQueryApplier;
  lt(column: string, value: string): InboxFilterQueryApplier;
  lte(column: string, value: string): InboxFilterQueryApplier;
  gt(column: string, value: string): InboxFilterQueryApplier;
  gte(column: string, value: string): InboxFilterQueryApplier;
  filter(column: string, operator: string, value: string): InboxFilterQueryApplier;
  or(expression: string): InboxFilterQueryApplier;
};

export function applyInboxFilterQuerySteps<T extends InboxFilterQueryApplier>(
  q: T,
  steps: InboxFilterQueryStep[]
): T {
  let cur = q;
  for (const step of steps) {
    if (step.kind === "lead_management_status") {
      if (step.value === "NEW") {
        cur = cur.filter("leads.status", "eq", "NEW") as T;
      } else if (step.value === "WON") {
        cur = cur.filter("leads.status", "eq", "WON") as T;
      } else if (step.value === "LOST") {
        cur = cur.filter("leads.status", "eq", "LOST") as T;
      } else if (step.value === "CLOSED") {
        cur = cur.filter("leads.status", "eq", "UNQUALIFIED") as T;
      } else if (step.value === "FOLLOW_UP") {
        cur = cur.not("follow_up_at", "is", null) as T;
      } else if (step.value === "IN_PROGRESS") {
        cur = cur
          .filter("leads.status", "in", `(${IN_PROGRESS_LEAD_STATUSES_CSV})`)
          .is("follow_up_at", null) as T;
      }
    } else if (step.kind === "follow_up_scheduled") {
      cur = cur.not("follow_up_at", "is", null) as T;
    } else if (step.kind === "follow_up_none") {
      cur = cur.is("follow_up_at", null) as T;
    } else if (step.kind === "follow_up_overdue") {
      cur = cur.not("follow_up_at", "is", null).lt("follow_up_at", step.beforeIso) as T;
    } else if (step.kind === "follow_up_today") {
      cur = cur
        .not("follow_up_at", "is", null)
        .gte("follow_up_at", step.fromIso)
        .lt("follow_up_at", step.toIso)
        .gte("follow_up_at", step.minIso) as T;
    } else if (step.kind === "sla_active") {
      cur = cur.not("sla_due_at", "is", null) as T;
    } else if (step.kind === "sla_none") {
      cur = cur.is("sla_due_at", null) as T;
    } else if (step.kind === "sla_overdue") {
      cur = cur.not("sla_due_at", "is", null).lt("sla_due_at", step.beforeIso) as T;
    } else if (step.kind === "sla_due_soon") {
      cur = cur
        .not("sla_due_at", "is", null)
        .gt("sla_due_at", step.afterIso)
        .lte("sla_due_at", step.beforeIso) as T;
    } else if (step.kind === "waiting_needs_response") {
      cur = cur.or(
        "and(last_customer_message_at.not.is.null,last_agent_message_at.is.null),last_customer_message_at.gt.last_agent_message_at"
      ) as T;
    } else if (step.kind === "waiting_customer") {
      cur = cur.or(
        "and(last_agent_message_at.not.is.null,last_customer_message_at.is.null),last_agent_message_at.gt.last_customer_message_at"
      ) as T;
    }
  }
  return cur;
}

/** @deprecated use ConversationListLeadManagementStatusParam */
export type ConversationListLeadStatusParam = (typeof LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES)[number];

/** @deprecated use CONVERSATION_LIST_LEAD_MANAGEMENT_STATUS_VALUES */
export const CONVERSATION_LIST_LEAD_STATUS_VALUES = LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES;

/** @deprecated use ConversationsListQuerySchema fields */
export const ConversationListInboxFiltersQuerySchema = z.object({
  leadStatus: z.enum(LEGACY_CONVERSATION_LIST_LEAD_STATUS_VALUES).optional(),
  followUp: LegacyFollowUpAlias.optional(),
  sla: LegacySlaAlias.optional()
});
