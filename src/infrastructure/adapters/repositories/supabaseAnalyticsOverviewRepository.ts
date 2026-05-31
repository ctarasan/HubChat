import type { UtcInboxFilterClock } from "../../../interfaces/api/conversationListInboxFilters.js";
import {
  ANALYTICS_CHANNELS,
  type AnalyticsChannel,
  IN_PROGRESS_LEAD_STATUSES_FOR_ANALYTICS,
  LEAD_STATUSES_FOR_ANALYTICS,
  type AnalyticsPeriod
} from "../../../domain/analyticsOverview.js";
import type { LeadStatus } from "../../../domain/entities.js";
import {
  analyticsHeadCount,
  createAnalyticsQueryCounter,
  type AnalyticsCountFilter,
  type AnalyticsHeadCountClient,
  type AnalyticsQueryCounter
} from "../../../lib/analyticsHeadCount.js";

export const ANALYTICS_MAX_ACTIVE_AGENTS = 50;

export type AnalyticsActiveAgentRow = {
  id: string;
  name: string;
};

export type AnalyticsOverviewRawCounts = {
  conversations: {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    archived: number;
    legacyClosed: number;
    newInPeriod: number;
    byChannel: Array<{ channel: AnalyticsChannel; open: number; total: number }>;
  };
  sla: {
    active: number;
    overdue: number;
    dueSoon: number;
    onTrack: number;
    none: number;
  };
  followUps: {
    scheduled: number;
    overdue: number;
    dueToday: number;
    none: number;
  };
  leads: {
    byStatus: Record<string, number>;
    unassigned: number;
  };
  messages: {
    inbound: Record<AnalyticsChannel, number>;
    outbound: Record<AnalyticsChannel, number>;
  };
  agents: AnalyticsActiveAgentRow[];
  teamByAgent: Array<{
    salesAgentId: string;
    displayName: string;
    openConversations: number;
    overdueSla: number;
    followUpOverdue: number;
    assignedLeads: number;
    leadCount: number;
  }>;
  queryCount: number;
};

type TenantFilter = { column: "tenant_id"; op: "eq"; value: string };

function tenantEq(tenantId: string): TenantFilter {
  return { column: "tenant_id", op: "eq", value: tenantId };
}

type AnalyticsSalesAgentsClient = {
  from(table: "sales_agents"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          limit(n: number): Promise<{
            data: AnalyticsActiveAgentRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export class SupabaseAnalyticsOverviewRepository {
  constructor(private readonly client: AnalyticsHeadCountClient & AnalyticsSalesAgentsClient) {}

  private async count(
    counter: AnalyticsQueryCounter,
    table: "conversations" | "leads" | "messages",
    filters: AnalyticsCountFilter[]
  ): Promise<number> {
    counter.increment();
    return analyticsHeadCount(this.client, table, filters);
  }

  async fetchCounts(input: {
    tenantId: string;
    period: AnalyticsPeriod;
    clock: UtcInboxFilterClock;
  }): Promise<AnalyticsOverviewRawCounts> {
    const counter = createAnalyticsQueryCounter();
    const { tenantId, period, clock } = input;
    const t = tenantEq(tenantId);
    const openStatuses = ["OPEN", "PENDING"];

    const [
      total,
      open,
      pending,
      resolved,
      archived,
      legacyClosed,
      newInPeriod,
      slaActive,
      slaOverdue,
      slaDueSoon,
      slaOnTrack,
      slaNone,
      fuScheduled,
      fuOverdue,
      fuDueToday,
      fuNone,
      leadsUnassigned
    ] = await Promise.all([
      this.count(counter, "conversations", [t]),
      this.count(counter, "conversations", [t, { column: "status", op: "eq", value: "OPEN" }]),
      this.count(counter, "conversations", [t, { column: "status", op: "eq", value: "PENDING" }]),
      this.count(counter, "conversations", [t, { column: "status", op: "eq", value: "RESOLVED" }]),
      this.count(counter, "conversations", [t, { column: "status", op: "eq", value: "ARCHIVED" }]),
      this.count(counter, "conversations", [t, { column: "status", op: "eq", value: "CLOSED" }]),
      this.count(counter, "conversations", [
        t,
        { column: "created_at", op: "gte", value: period.startAt },
        { column: "created_at", op: "lte", value: period.endAt }
      ]),
      this.count(counter, "conversations", [t, { column: "sla_due_at", op: "not_is", value: null }]),
      this.count(counter, "conversations", [
        t,
        { column: "sla_due_at", op: "not_is", value: null },
        { column: "sla_due_at", op: "lt", value: clock.nowIso }
      ]),
      this.count(counter, "conversations", [
        t,
        { column: "sla_due_at", op: "not_is", value: null },
        { column: "sla_due_at", op: "gt", value: clock.nowIso },
        { column: "sla_due_at", op: "lte", value: clock.slaDueSoonEndIso }
      ]),
      this.count(counter, "conversations", [
        t,
        { column: "sla_due_at", op: "not_is", value: null },
        { column: "sla_due_at", op: "gt", value: clock.slaDueSoonEndIso }
      ]),
      this.count(counter, "conversations", [t, { column: "sla_due_at", op: "is", value: null }]),
      this.count(counter, "conversations", [t, { column: "follow_up_at", op: "not_is", value: null }]),
      this.count(counter, "conversations", [
        t,
        { column: "follow_up_at", op: "not_is", value: null },
        { column: "follow_up_at", op: "lt", value: clock.nowIso }
      ]),
      this.count(counter, "conversations", [
        t,
        { column: "follow_up_at", op: "not_is", value: null },
        { column: "follow_up_at", op: "gte", value: clock.dayStartIso },
        { column: "follow_up_at", op: "lt", value: clock.dayEndIso },
        { column: "follow_up_at", op: "gte", value: clock.nowIso }
      ]),
      this.count(counter, "conversations", [t, { column: "follow_up_at", op: "is", value: null }]),
      this.count(counter, "leads", [t, { column: "assigned_sales_id", op: "is", value: null }])
    ]);

    const byChannel = await Promise.all(
      ANALYTICS_CHANNELS.map(async (channel) => {
        const [channelTotal, channelOpen] = await Promise.all([
          this.count(counter, "conversations", [
            t,
            { column: "channel_type", op: "eq", value: channel }
          ]),
          this.count(counter, "conversations", [
            t,
            { column: "channel_type", op: "eq", value: channel },
            { column: "status", op: "in", values: openStatuses }
          ])
        ]);
        return { channel, open: channelOpen, total: channelTotal };
      })
    );

    const byStatus: Record<string, number> = {};
    await Promise.all(
      LEAD_STATUSES_FOR_ANALYTICS.map(async (status) => {
        byStatus[status] = await this.count(counter, "leads", [
          t,
          { column: "status", op: "eq", value: status }
        ]);
      })
    );

    const inbound = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 } as Record<AnalyticsChannel, number>;
    const outbound = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 } as Record<AnalyticsChannel, number>;
    await Promise.all(
      ANALYTICS_CHANNELS.flatMap((channel) => [
        (async () => {
          inbound[channel] = await this.count(counter, "messages", [
            t,
            { column: "channel_type", op: "eq", value: channel },
            { column: "direction", op: "eq", value: "INBOUND" },
            { column: "created_at", op: "gte", value: period.startAt },
            { column: "created_at", op: "lte", value: period.endAt }
          ]);
        })(),
        (async () => {
          outbound[channel] = await this.count(counter, "messages", [
            t,
            { column: "channel_type", op: "eq", value: channel },
            { column: "direction", op: "eq", value: "OUTBOUND" },
            { column: "created_at", op: "gte", value: period.startAt },
            { column: "created_at", op: "lte", value: period.endAt }
          ]);
        })()
      ])
    );

    const agentsRes = await this.client
      .from("sales_agents")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .eq("status", "ACTIVE")
      .limit(ANALYTICS_MAX_ACTIVE_AGENTS);
    if (agentsRes.error) throw agentsRes.error;
    const agents = (agentsRes.data ?? []) as AnalyticsActiveAgentRow[];

    const teamByAgent = await Promise.all(
      agents.map(async (agent) => {
        const agentEq: AnalyticsCountFilter = {
          column: "assigned_agent_id",
          op: "eq",
          value: agent.id
        };
        const leadAgentEq: AnalyticsCountFilter = {
          column: "assigned_sales_id",
          op: "eq",
          value: agent.id
        };
        const [openConversations, overdueSla, followUpOverdue, assignedLeads] = await Promise.all([
          this.count(counter, "conversations", [
            t,
            agentEq,
            { column: "status", op: "in", values: openStatuses }
          ]),
          this.count(counter, "conversations", [
            t,
            agentEq,
            { column: "sla_due_at", op: "not_is", value: null },
            { column: "sla_due_at", op: "lt", value: clock.nowIso }
          ]),
          this.count(counter, "conversations", [
            t,
            agentEq,
            { column: "follow_up_at", op: "not_is", value: null },
            { column: "follow_up_at", op: "lt", value: clock.nowIso }
          ]),
          this.count(counter, "leads", [t, leadAgentEq])
        ]);
        return {
          salesAgentId: agent.id,
          displayName: agent.name?.trim() || "Unknown",
          openConversations,
          overdueSla,
          followUpOverdue,
          assignedLeads,
          leadCount: assignedLeads
        };
      })
    );

    return {
      conversations: {
        total,
        open,
        pending,
        resolved,
        archived,
        legacyClosed,
        newInPeriod,
        byChannel
      },
      sla: {
        active: slaActive,
        overdue: slaOverdue,
        dueSoon: slaDueSoon,
        onTrack: slaOnTrack,
        none: slaNone
      },
      followUps: {
        scheduled: fuScheduled,
        overdue: fuOverdue,
        dueToday: fuDueToday,
        none: fuNone
      },
      leads: {
        byStatus,
        unassigned: leadsUnassigned
      },
      messages: { inbound, outbound },
      agents,
      teamByAgent,
      queryCount: counter.get()
    };
  }
}

export function buildManagementRollupFromLeadCounts(byStatus: Record<string, number>, followUpScheduled: number) {
  const inProgress = IN_PROGRESS_LEAD_STATUSES_FOR_ANALYTICS.reduce(
    (sum, s) => sum + (byStatus[s] ?? 0),
    0
  );
  return {
    NEW: byStatus.NEW ?? 0,
    IN_PROGRESS: inProgress,
    FOLLOW_UP: followUpScheduled,
    WON: byStatus.WON ?? 0,
    LOST: byStatus.LOST ?? 0,
    CLOSED: byStatus.UNQUALIFIED ?? 0
  };
}

export function buildLeadByOwner(teamByAgent: AnalyticsOverviewRawCounts["teamByAgent"]) {
  return teamByAgent
    .map((row) => ({
      salesAgentId: row.salesAgentId,
      displayName: row.displayName,
      leadCount: row.leadCount
    }))
    .sort((a, b) => b.leadCount - a.leadCount);
}
