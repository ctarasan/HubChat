import type { ConversationStatus, LeadStatus } from "./entities.js";
import type { ConversationWaitingKind, FollowUpBucket, SlaBucket } from "./conversationInboxBuckets.js";

/** Whether an inbound customer message should reopen a resolved conversation. */
export function shouldReopenConversationOnCustomerReply(status: ConversationStatus): boolean {
  return status === "RESOLVED";
}

/**
 * Automatic lead promotion after the first agent reply when lead is still early-stage.
 * Returns null when no automatic change applies.
 */
export function suggestLeadStatusAfterFirstAgentReply(current: LeadStatus): LeadStatus | null {
  if (current === "NEW" || current === "ASSIGNED") return "CONTACTED";
  return null;
}

export type InboxPresentationBucket =
  | "sla_overdue"
  | "sla_due_soon"
  | "follow_up_overdue"
  | "follow_up_today"
  | "follow_up_upcoming"
  | "waiting_for_agent"
  | "waiting_for_customer"
  | "no_recent_customer_message";

export function mapSlaBucketToPresentation(bucket: SlaBucket): InboxPresentationBucket | null {
  if (bucket === "overdue") return "sla_overdue";
  if (bucket === "dueSoon") return "sla_due_soon";
  return null;
}

export function mapFollowUpBucketToPresentation(bucket: FollowUpBucket): InboxPresentationBucket | null {
  if (bucket === "overdue") return "follow_up_overdue";
  if (bucket === "today") return "follow_up_today";
  if (bucket === "upcoming") return "follow_up_upcoming";
  return null;
}

export function mapWaitingKindToPresentation(kind: ConversationWaitingKind): InboxPresentationBucket | null {
  if (kind === "waitingOnUs") return "waiting_for_agent";
  if (kind === "waitingOnCustomer") return "waiting_for_customer";
  if (kind === "noRecentMessage") return "no_recent_customer_message";
  return null;
}
