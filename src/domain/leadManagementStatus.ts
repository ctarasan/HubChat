import { assertValidLeadStatusTransition, type LeadStatus } from "./entities.js";

/** Simplified lead-management statuses exposed on conversation APIs (maps to `leads.status`). */
export type LeadManagementStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "FOLLOW_UP"
  | "WON"
  | "LOST"
  | "CLOSED";

export const LEAD_MANAGEMENT_STATUSES: LeadManagementStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "FOLLOW_UP",
  "WON",
  "LOST",
  "CLOSED"
];

/** Writable values for PATCH /api/conversations/[id]/lead-status (management + funnel qualified). */
export type PatchConversationLeadStatusWrite = LeadManagementStatus | "QUALIFIED";

const IN_PROGRESS_LEAD_STATUSES: LeadStatus[] = [
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION"
];

export function isTerminalLeadManagementStatus(status: LeadManagementStatus): boolean {
  return status === "WON" || status === "LOST" || status === "CLOSED";
}

/** Derive dashboard-facing management status from persisted lead status + follow-up reminder. */
export function leadStatusToManagementStatus(
  status: LeadStatus,
  followUpAt: Date | null | undefined
): LeadManagementStatus {
  if (status === "NEW") return "NEW";
  if (status === "WON") return "WON";
  if (status === "LOST") return "LOST";
  if (status === "UNQUALIFIED") return "CLOSED";
  if (followUpAt instanceof Date && !Number.isNaN(followUpAt.getTime())) {
    return "FOLLOW_UP";
  }
  if (IN_PROGRESS_LEAD_STATUSES.includes(status)) return "IN_PROGRESS";
  return "IN_PROGRESS";
}

/** Pick a valid `leads.status` value for a management-status write without downgrading funnel depth. */
export function resolveLeadStatusForManagementUpdate(
  current: LeadStatus,
  next: LeadManagementStatus
): LeadStatus {
  if (next === "NEW") return "NEW";
  if (next === "WON") return "WON";
  if (next === "LOST") return "LOST";
  if (next === "CLOSED") return "UNQUALIFIED";
  if (current === "NEW" || current === "ASSIGNED") return "CONTACTED";
  if (IN_PROGRESS_LEAD_STATUSES.includes(current)) return current;
  return "CONTACTED";
}

export function assertValidPatchConversationLeadStatusWrite(
  previousLeadStatus: LeadStatus,
  previousFollowUpAt: Date | null | undefined,
  next: PatchConversationLeadStatusWrite
): void {
  if (next === "QUALIFIED") {
    assertValidLeadStatusTransition(previousLeadStatus, "QUALIFIED");
    return;
  }
  const previousManagement = leadStatusToManagementStatus(previousLeadStatus, previousFollowUpAt);
  assertValidLeadManagementStatusTransition(previousManagement, next);
}

export function resolveLeadStatusAfterPatchWrite(
  previousLeadStatus: LeadStatus,
  next: PatchConversationLeadStatusWrite
): LeadStatus {
  if (next === "QUALIFIED") return "QUALIFIED";
  return resolveLeadStatusForManagementUpdate(previousLeadStatus, next);
}

const managementTransitions: Record<LeadManagementStatus, LeadManagementStatus[]> = {
  NEW: ["IN_PROGRESS", "FOLLOW_UP", "WON", "LOST", "CLOSED"],
  IN_PROGRESS: ["NEW", "FOLLOW_UP", "WON", "LOST", "CLOSED"],
  FOLLOW_UP: ["NEW", "IN_PROGRESS", "WON", "LOST", "CLOSED"],
  WON: [],
  LOST: [],
  CLOSED: []
};

export function listAllowedLeadManagementStatusTransitions(
  from: LeadManagementStatus
): LeadManagementStatus[] {
  return managementTransitions[from] ?? [];
}

export function assertValidLeadManagementStatusTransition(
  from: LeadManagementStatus,
  to: LeadManagementStatus
): void {
  if (from === to) return;
  if (!managementTransitions[from].includes(to)) {
    throw new Error(`Invalid lead management status transition: ${from} -> ${to}`);
  }
}
