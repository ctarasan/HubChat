import type { FollowUpBucket } from "./conversationInboxBuckets.js";
import { computeFollowUpBucket } from "./conversationInboxBuckets.js";
import { leadStatusToManagementStatus, type LeadManagementStatus } from "./leadManagementStatus.js";
import type { ChannelType, ConversationStatus, LeadStatus } from "./entities.js";

export const WORKFLOW_API_VERSION = 1 as const;

export const WORKFLOW_KINDS = ["follow_up"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const WORKFLOW_SCOPES = ["mine", "team"] as const;
export type WorkflowScope = (typeof WORKFLOW_SCOPES)[number];

export const WORKFLOW_FOLLOW_UP_STATUSES = [
  "overdue",
  "due_today",
  "upcoming",
  "scheduled"
] as const;
export type WorkflowFollowUpStatus = (typeof WORKFLOW_FOLLOW_UP_STATUSES)[number];

export const WORKFLOW_CHANNELS = ["LINE", "FACEBOOK", "INSTAGRAM"] as const;
export type WorkflowChannel = (typeof WORKFLOW_CHANNELS)[number];

export const WORKFLOW_ITEM_PRIORITIES = ["critical", "warn", "info"] as const;
export type WorkflowItemPriority = (typeof WORKFLOW_ITEM_PRIORITIES)[number];

export const WORKFLOW_REASON_CODES = [
  "FOLLOW_UP_OVERDUE",
  "FOLLOW_UP_DUE_TODAY",
  "FOLLOW_UP_UPCOMING",
  "CUSTOMER_REPLIED_AFTER_FOLLOW_UP"
] as const;
export type WorkflowReasonCode = (typeof WORKFLOW_REASON_CODES)[number];

export const WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES = ["OPEN", "PENDING"] as const;
export type WorkflowActionableConversationStatus =
  (typeof WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES)[number];

export type WorkflowFollowUpCounts = {
  scheduled: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
};

export type WorkflowSummaryDto = {
  generatedAt: string;
  scope: WorkflowScope;
  followUp: WorkflowFollowUpCounts;
  meta: { version: typeof WORKFLOW_API_VERSION };
};

export type WorkflowFollowUpItemDto = {
  id: string;
  kind: "FOLLOW_UP";
  status: WorkflowFollowUpStatus;
  priority: WorkflowItemPriority;
  conversationId: string;
  leadId: string | null;
  channelType: WorkflowChannel;
  assignedAgentId: string | null;
  assignedAgentDisplayName: string | null;
  customerDisplayName: string;
  dueAt: string;
  leadManagementStatus: LeadManagementStatus | null;
  conversationStatus: WorkflowActionableConversationStatus;
  flags: { customerRepliedAfterFollowUp: boolean };
  reasonCode: WorkflowReasonCode;
  reasonLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowItemsPageDto = {
  generatedAt: string;
  scope: WorkflowScope;
  kind: WorkflowKind;
  items: WorkflowFollowUpItemDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
  sections: { followUp: WorkflowFollowUpCounts };
  meta: { version: typeof WORKFLOW_API_VERSION };
};

/** Maps inbox follow-up bucket to workflow list status (excludes meta `scheduled`). */
export function followUpBucketToWorkflowStatus(
  bucket: FollowUpBucket
): Exclude<WorkflowFollowUpStatus, "scheduled"> | null {
  if (bucket === "overdue") return "overdue";
  if (bucket === "today") return "due_today";
  if (bucket === "upcoming") return "upcoming";
  return null;
}

export function workflowStatusSortRank(status: WorkflowFollowUpStatus): number {
  if (status === "overdue") return 0;
  if (status === "due_today") return 1;
  if (status === "upcoming") return 2;
  return 3;
}

export function priorityForWorkflowStatus(
  status: WorkflowFollowUpStatus,
  customerRepliedAfterFollowUp: boolean
): WorkflowItemPriority {
  if (status === "overdue") return "critical";
  if (status === "due_today") return "warn";
  if (customerRepliedAfterFollowUp) return "warn";
  return "info";
}

export function reasonForWorkflowItem(input: {
  status: WorkflowFollowUpStatus;
  customerRepliedAfterFollowUp: boolean;
}): { reasonCode: WorkflowReasonCode; reasonLabel: string } {
  if (input.customerRepliedAfterFollowUp) {
    return {
      reasonCode: "CUSTOMER_REPLIED_AFTER_FOLLOW_UP",
      reasonLabel: "Customer replied after follow-up was scheduled"
    };
  }
  if (input.status === "overdue") {
    return { reasonCode: "FOLLOW_UP_OVERDUE", reasonLabel: "Follow-up overdue" };
  }
  if (input.status === "due_today") {
    return { reasonCode: "FOLLOW_UP_DUE_TODAY", reasonLabel: "Follow-up due today" };
  }
  return { reasonCode: "FOLLOW_UP_UPCOMING", reasonLabel: "Follow-up upcoming" };
}

export function stableFollowUpWorkItemId(conversationId: string): string {
  return `follow_up:${conversationId}`;
}

export function computeCustomerRepliedAfterFollowUp(input: {
  followUpAt: Date | null;
  lastCustomerMessageAt: Date | null;
}): boolean {
  const { followUpAt, lastCustomerMessageAt } = input;
  if (!followUpAt || !lastCustomerMessageAt) return false;
  const fu = followUpAt.getTime();
  const lc = lastCustomerMessageAt.getTime();
  if (Number.isNaN(fu) || Number.isNaN(lc)) return false;
  return lc > fu;
}

export function resolveWorkflowFollowUpStatus(
  now: Date,
  followUpAt: Date | null
): WorkflowFollowUpStatus | null {
  const bucket = computeFollowUpBucket(now, followUpAt);
  return followUpBucketToWorkflowStatus(bucket);
}

export function isWorkflowActionableConversationStatus(
  status: string
): status is WorkflowActionableConversationStatus {
  return (WORKFLOW_ACTIONABLE_CONVERSATION_STATUSES as readonly string[]).includes(status);
}

export function isWorkflowChannel(value: string): value is WorkflowChannel {
  return (WORKFLOW_CHANNELS as readonly string[]).includes(value);
}

export type WorkflowListRow = {
  id: string;
  lead_id: string | null;
  channel_type: string;
  status: string;
  follow_up_at: string;
  assigned_agent_id: string | null;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  created_at: string;
  updated_at: string;
  participant_display_name: string | null;
  leads?: { status?: string } | { status?: string }[] | null;
  contacts?: { display_name?: string | null } | null;
  sales_agents?: { id?: string; name?: string | null } | { id?: string; name?: string | null }[] | null;
  contactIdentityDisplayName?: string | null;
};

export function resolveWorkflowCustomerDisplayName(row: WorkflowListRow): string {
  const contactName =
    row.contactIdentityDisplayName ??
    (row.contacts && typeof row.contacts === "object" && "display_name" in row.contacts
      ? row.contacts.display_name
      : null);
  if (typeof contactName === "string" && contactName.trim()) return contactName.trim();
  const participant = row.participant_display_name;
  if (typeof participant === "string" && participant.trim()) return participant.trim();
  return "Customer";
}

export function mapWorkflowListRowToItem(row: WorkflowListRow, now: Date): WorkflowFollowUpItemDto | null {
  const followUpAt = new Date(row.follow_up_at);
  const status = resolveWorkflowFollowUpStatus(now, followUpAt);
  if (!status) return null;
  if (!isWorkflowActionableConversationStatus(row.status)) return null;
  if (!isWorkflowChannel(row.channel_type)) return null;

  const leadRaw = row.leads;
  const leadObj = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw;
  const leadStatus = typeof leadObj?.status === "string" ? (leadObj.status as LeadStatus) : null;
  const leadManagementStatus = leadStatus
    ? leadStatusToManagementStatus(leadStatus, followUpAt)
    : null;

  const agentRaw = row.sales_agents;
  const agentObj = Array.isArray(agentRaw) ? agentRaw[0] : agentRaw;
  const assignedAgentDisplayName =
    typeof agentObj?.name === "string" && agentObj.name.trim() ? agentObj.name.trim() : null;

  const customerRepliedAfterFollowUp = computeCustomerRepliedAfterFollowUp({
    followUpAt,
    lastCustomerMessageAt: row.last_customer_message_at
      ? new Date(row.last_customer_message_at)
      : null
  });

  const reason = reasonForWorkflowItem({ status, customerRepliedAfterFollowUp });

  return {
    id: stableFollowUpWorkItemId(row.id),
    kind: "FOLLOW_UP",
    status,
    priority: priorityForWorkflowStatus(status, customerRepliedAfterFollowUp),
    conversationId: row.id,
    leadId: row.lead_id,
    channelType: row.channel_type,
    assignedAgentId: row.assigned_agent_id,
    assignedAgentDisplayName,
    customerDisplayName: resolveWorkflowCustomerDisplayName(row),
    dueAt: followUpAt.toISOString(),
    leadManagementStatus,
    conversationStatus: row.status,
    flags: { customerRepliedAfterFollowUp },
    reasonCode: reason.reasonCode,
    reasonLabel: reason.reasonLabel,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
