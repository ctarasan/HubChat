import type { AnalyticsOverviewDto, AnalyticsRange } from "../../domain/analyticsOverview.js";
import { loadEffectiveTenantSlaPolicy } from "../sla/loadEffectiveTenantSlaPolicy.js";
import { inboxFilterClockFromPolicy } from "../sla/resolveInboxFilterClock.js";
import type { SlaPolicyRepository } from "../../domain/slaPolicyApi.js";
import { resolveAnalyticsPeriod } from "../../interfaces/api/analyticsOverviewContracts.js";
import {
  buildLeadByOwner,
  buildManagementRollupFromLeadCounts,
  SupabaseAnalyticsOverviewRepository,
  type AnalyticsOverviewRawCounts
} from "../../infrastructure/adapters/repositories/supabaseAnalyticsOverviewRepository.js";
import type { AnalyticsHeadCountClient } from "../../lib/analyticsHeadCount.js";

export type GetAnalyticsOverviewInput = {
  tenantId: string;
  range: AnalyticsRange;
  now?: Date;
};

export type GetAnalyticsOverviewDeps = {
  fetchCounts: (input: {
    tenantId: string;
    period: { startAt: string; endAt: string };
    clock: ReturnType<typeof inboxFilterClockFromPolicy>;
  }) => Promise<AnalyticsOverviewRawCounts>;
  loadSlaPolicy: (
    tenantId: string
  ) => Promise<{ warningBeforeBreachMinutes: number; enabled: boolean }>;
};

function computeBreachRate(overdue: number, active: number): number {
  if (active <= 0) return 0;
  return overdue / active;
}

function buildSummaryCards(raw: AnalyticsOverviewRawCounts): AnalyticsOverviewDto["summaryCards"] {
  const openWorkload = raw.conversations.open + raw.conversations.pending;
  return [
    { id: "conversations_open", label: "Open conversations", value: openWorkload, unit: "count" },
    { id: "sla_overdue", label: "SLA overdue", value: raw.sla.overdue, unit: "count" },
    { id: "sla_due_soon", label: "SLA due soon", value: raw.sla.dueSoon, unit: "count" },
    { id: "follow_up_overdue", label: "Follow-up overdue", value: raw.followUps.overdue, unit: "count" },
    {
      id: "conversations_new_period",
      label: "New conversations (period)",
      value: raw.conversations.newInPeriod,
      unit: "count"
    },
    { id: "leads_qualified", label: "Qualified leads", value: raw.leads.byStatus.QUALIFIED ?? 0, unit: "count" }
  ];
}

function toDto(
  range: AnalyticsRange,
  period: { startAt: string; endAt: string },
  generatedAt: string,
  slaPolicy: { warningBeforeBreachMinutes: number; enabled: boolean },
  raw: AnalyticsOverviewRawCounts
): AnalyticsOverviewDto {
  const managementRollup = buildManagementRollupFromLeadCounts(
    raw.leads.byStatus,
    raw.followUps.scheduled
  );
  return {
    range,
    period,
    generatedAt,
    slaPolicy,
    summaryCards: buildSummaryCards(raw),
    conversations: {
      snapshot: {
        total: raw.conversations.total,
        open: raw.conversations.open,
        pending: raw.conversations.pending,
        resolved: raw.conversations.resolved,
        archived: raw.conversations.archived,
        legacyClosed: raw.conversations.legacyClosed
      },
      period: { newCount: raw.conversations.newInPeriod },
      byChannel: raw.conversations.byChannel
    },
    sla: {
      snapshot: raw.sla,
      rates: { breachRate: computeBreachRate(raw.sla.overdue, raw.sla.active) }
    },
    leadPipeline: {
      byStatus: raw.leads.byStatus,
      managementRollup,
      highlights: {
        qualified: raw.leads.byStatus.QUALIFIED ?? 0,
        won: raw.leads.byStatus.WON ?? 0,
        lost: raw.leads.byStatus.LOST ?? 0,
        unassigned: raw.leads.unassigned
      },
      byOwner: buildLeadByOwner(raw.teamByAgent)
    },
    channelBreakdown: {
      period: {
        inboundMessages: raw.messages.inbound,
        outboundMessages: raw.messages.outbound
      }
    },
    teamWorkload: raw.teamByAgent.map((row) => ({
      salesAgentId: row.salesAgentId,
      displayName: row.displayName,
      openConversations: row.openConversations,
      overdueSla: row.overdueSla,
      followUpOverdue: row.followUpOverdue,
      assignedLeads: row.assignedLeads
    })),
    followUps: { snapshot: raw.followUps },
    meta: {
      queryCount: raw.queryCount,
      version: 1
    }
  };
}

export class GetAnalyticsOverviewUseCase {
  constructor(private readonly deps: GetAnalyticsOverviewDeps) {}

  async execute(input: GetAnalyticsOverviewInput): Promise<AnalyticsOverviewDto> {
    const now = input.now ?? new Date();
    const period = resolveAnalyticsPeriod(input.range, now);
    const policy = await this.deps.loadSlaPolicy(input.tenantId);
    const clock = inboxFilterClockFromPolicy(now, policy);
    const raw = await this.deps.fetchCounts({
      tenantId: input.tenantId,
      period,
      clock
    });
    return toDto(input.range, period, now.toISOString(), policy, raw);
  }
}

export function createGetAnalyticsOverviewUseCaseFromSupabase(
  client: AnalyticsHeadCountClient & ConstructorParameters<typeof SupabaseAnalyticsOverviewRepository>[0],
  slaPolicyRepository?: Pick<SlaPolicyRepository, "findByTenantId">
): GetAnalyticsOverviewUseCase {
  const repo = new SupabaseAnalyticsOverviewRepository(client);
  return new GetAnalyticsOverviewUseCase({
    fetchCounts: (input) => repo.fetchCounts(input),
    loadSlaPolicy: async (tenantId) => {
      const policy = await loadEffectiveTenantSlaPolicy(tenantId, slaPolicyRepository);
      return {
        warningBeforeBreachMinutes: policy.warningBeforeBreachMinutes,
        enabled: policy.enabled
      };
    }
  });
}
