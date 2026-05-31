import type { LeadStatus } from "./entities.js";

/** Analytics MVP channels (aligned with inbox list filters). */
export const ANALYTICS_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number];

export type AnalyticsRange = "today" | "7d" | "30d";

export type AnalyticsPeriod = {
  startAt: string;
  endAt: string;
};

export type AnalyticsSlaPolicySummary = {
  warningBeforeBreachMinutes: number;
  enabled: boolean;
};

export type AnalyticsSummaryCard = {
  id: string;
  label: string;
  value: number;
  unit?: "count" | "percent";
  trend?: null;
};

export type AnalyticsConversationSnapshot = {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  archived: number;
  legacyClosed: number;
};

export type AnalyticsChannelConversationRow = {
  channel: AnalyticsChannel;
  open: number;
  total: number;
};

export type AnalyticsSlaSnapshot = {
  active: number;
  overdue: number;
  dueSoon: number;
  onTrack: number;
  none: number;
};

export type AnalyticsLeadManagementRollup = {
  NEW: number;
  IN_PROGRESS: number;
  FOLLOW_UP: number;
  WON: number;
  LOST: number;
  CLOSED: number;
};

export type AnalyticsLeadHighlights = {
  qualified: number;
  won: number;
  lost: number;
  unassigned: number;
};

export type AnalyticsLeadByOwnerRow = {
  salesAgentId: string;
  displayName: string;
  leadCount: number;
};

export type AnalyticsTeamWorkloadRow = {
  salesAgentId: string;
  displayName: string;
  openConversations: number;
  overdueSla: number;
  followUpOverdue: number;
  assignedLeads: number;
};

export type AnalyticsFollowUpSnapshot = {
  scheduled: number;
  overdue: number;
  dueToday: number;
  none: number;
};

export type AnalyticsOverviewDto = {
  range: AnalyticsRange;
  period: AnalyticsPeriod;
  generatedAt: string;
  slaPolicy: AnalyticsSlaPolicySummary;
  summaryCards: AnalyticsSummaryCard[];
  conversations: {
    snapshot: AnalyticsConversationSnapshot;
    period: { newCount: number };
    byChannel: AnalyticsChannelConversationRow[];
  };
  sla: {
    snapshot: AnalyticsSlaSnapshot;
    rates: { breachRate: number };
  };
  leadPipeline: {
    byStatus: Record<string, number>;
    managementRollup: AnalyticsLeadManagementRollup;
    highlights: AnalyticsLeadHighlights;
    byOwner: AnalyticsLeadByOwnerRow[];
  };
  channelBreakdown: {
    period: {
      inboundMessages: Record<AnalyticsChannel, number>;
      outboundMessages: Record<AnalyticsChannel, number>;
    };
  };
  teamWorkload: AnalyticsTeamWorkloadRow[];
  followUps: {
    snapshot: AnalyticsFollowUpSnapshot;
  };
  meta: {
    queryCount: number;
    version: 1;
  };
};

export const LEAD_STATUSES_FOR_ANALYTICS: LeadStatus[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "UNQUALIFIED"
];

export const IN_PROGRESS_LEAD_STATUSES_FOR_ANALYTICS: LeadStatus[] = [
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION"
];
