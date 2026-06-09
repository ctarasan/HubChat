import { z } from "zod";
import type { LeadStatus } from "../../domain/entities.js";
import type { ConversationListInboxFilters } from "./conversationListInboxFilters.js";
import { CONNECTION_SCOPE_VALUES } from "./connectionScopeQuery.js";
import type { ConnectionScopeMode } from "../../domain/channelConnectionScope.js";

export const LEADS_LIST_CHANNEL_VALUES = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type LeadsListChannelParam = (typeof LEADS_LIST_CHANNEL_VALUES)[number];

export const LEADS_LIST_OWNER_VALUES = ["me", "unassigned"] as const;
export type LeadsListOwnerParam = (typeof LEADS_LIST_OWNER_VALUES)[number];

export const LEADS_LIST_FOLLOW_UP_VALUES = ["overdue", "today", "scheduled", "none"] as const;
export type LeadsListFollowUpParam = (typeof LEADS_LIST_FOLLOW_UP_VALUES)[number];

export const LEADS_LIST_SLA_VALUES = ["overdue", "due_soon", "active", "none"] as const;
export type LeadsListSlaParam = (typeof LEADS_LIST_SLA_VALUES)[number];

const LEAD_STATUS_VALUES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "UNQUALIFIED"
] as const satisfies readonly LeadStatus[];

export const LeadsListQuerySchema = z
  .object({
    limit: z.string().optional(),
    cursor: z.string().optional(),
    status: z.enum(LEAD_STATUS_VALUES).optional(),
    channel: z.enum(LEADS_LIST_CHANNEL_VALUES).optional(),
    owner: z.enum(LEADS_LIST_OWNER_VALUES).optional(),
    followUp: z.enum(LEADS_LIST_FOLLOW_UP_VALUES).optional(),
    sla: z.enum(LEADS_LIST_SLA_VALUES).optional(),
    search: z.string().max(80).optional(),
    connectionScope: z.enum(CONNECTION_SCOPE_VALUES).optional()
  })
  .strict();

export type LeadsListQuery = z.infer<typeof LeadsListQuerySchema>;

export type ParsedLeadsListQuery = {
  cursor?: string;
  status?: LeadStatus;
  channel?: LeadsListChannelParam;
  owner?: LeadsListOwnerParam;
  followUp?: LeadsListFollowUpParam;
  sla?: LeadsListSlaParam;
  search?: string;
  connectionScope?: ConnectionScopeMode;
};

export function parseLeadsListQuery(
  qs: Record<string, string>
): { ok: true; value: ParsedLeadsListQuery } | { ok: false; message: string } {
  const parsed = LeadsListQuerySchema.safeParse(qs);
  if (!parsed.success) return { ok: false, message: parsed.error.message };
  const data = parsed.data;
  const searchRaw = data.search?.trim();
  return {
    ok: true,
    value: {
      cursor: data.cursor?.trim() || undefined,
      status: data.status,
      channel: data.channel,
      owner: data.owner,
      followUp: data.followUp,
      sla: data.sla,
      search: searchRaw && searchRaw.length > 0 ? searchRaw : undefined,
      connectionScope: data.connectionScope
    }
  };
}

export function buildLeadsListInboxFilters(input: {
  followUp?: LeadsListFollowUpParam;
  sla?: LeadsListSlaParam;
}): ConversationListInboxFilters | undefined {
  const filters: ConversationListInboxFilters = {};
  if (input.followUp) filters.followUp = input.followUp;
  if (input.sla) filters.sla = input.sla;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/** @deprecated use escapePostgrestIlikePattern from leadsSearchPostgrest */
export { escapePostgrestIlikePattern as escapeLeadsSearchIlikePattern } from "../../lib/leadsSearchPostgrest.js";
