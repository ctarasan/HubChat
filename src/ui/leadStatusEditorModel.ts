import type { LeadStatus } from "../domain/entities.js";
import {
  LEAD_MANAGEMENT_STATUSES,
  leadStatusToManagementStatus,
  listAllowedLeadManagementStatusTransitions,
  type LeadManagementStatus
} from "../domain/leadManagementStatus.js";

export type { LeadManagementStatus };
import { parseIsoToDate } from "./inboxBadgeLabels.js";

export type LeadStatusPatchBody = {
  leadStatus: LeadManagementStatus;
};

const LEAD_MANAGEMENT_STATUS_LABELS: Record<LeadManagementStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  FOLLOW_UP: "Follow up",
  WON: "Won",
  LOST: "Lost",
  CLOSED: "Closed"
};

export function getLeadManagementStatusLabel(status: string | null | undefined): string {
  const code = typeof status === "string" ? status.trim() : "";
  if (!code) return "";
  if (LEAD_MANAGEMENT_STATUSES.includes(code as LeadManagementStatus)) {
    return LEAD_MANAGEMENT_STATUS_LABELS[code as LeadManagementStatus];
  }
  return code;
}

export { listAllowedLeadManagementStatusTransitions };

export function buildLeadStatusPatch(nextStatus: LeadManagementStatus): LeadStatusPatchBody {
  return { leadStatus: nextStatus };
}

export function conversationLeadStatusPatchPath(conversationId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}/lead-status`;
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function nestedRawLeadStatus(row: {
  lead_status?: string | null;
  leadStatus?: string | null;
  leads?: { status?: string | null } | { status?: string | null }[] | null;
}): string {
  const flat = normalizeString(row.lead_status) || normalizeString(row.leadStatus);
  if (flat) return flat;
  const l = row.leads;
  if (!l) return "";
  if (Array.isArray(l)) return normalizeString(l[0]?.status);
  return normalizeString(l.status);
}

export function resolveLeadManagementStatusFromRow(row: {
  lead_management_status?: string | null;
  leadManagementStatus?: string | null;
  lead_status?: string | null;
  leadStatus?: string | null;
  follow_up_at?: string | null;
  followUpAt?: string | null;
  leads?: { status?: string | null } | { status?: string | null }[] | null;
}): LeadManagementStatus | "" {
  const direct =
    normalizeString(row.lead_management_status) || normalizeString(row.leadManagementStatus);
  if (LEAD_MANAGEMENT_STATUSES.includes(direct as LeadManagementStatus)) {
    return direct as LeadManagementStatus;
  }
  const raw = nestedRawLeadStatus(row);
  if (!raw) return "";
  const followIso = normalizeString(row.follow_up_at) || normalizeString(row.followUpAt);
  const followDate = followIso ? parseIsoToDate(followIso) : null;
  return leadStatusToManagementStatus(raw as LeadStatus, followDate);
}

export function mergeConversationLeadStatusFromPayload<T extends Record<string, unknown>>(
  row: T,
  payload: Record<string, unknown>
): T {
  const next = { ...row } as Record<string, unknown>;

  const managementRaw =
    payload.leadStatus ?? payload.lead_management_status ?? payload.leadManagementStatus;
  if (typeof managementRaw === "string" && managementRaw.trim()) {
    const mgmt = managementRaw.trim();
    next.lead_management_status = mgmt;
    next.leadManagementStatus = mgmt;
  }

  const dbStatus = payload.lead_status;
  if (typeof dbStatus === "string" && dbStatus.trim()) {
    const status = dbStatus.trim();
    next.lead_status = status;
    next.leadStatus = status;
    const existingLeads = next.leads;
    if (existingLeads && typeof existingLeads === "object" && !Array.isArray(existingLeads)) {
      next.leads = { ...(existingLeads as Record<string, unknown>), status };
    } else {
      next.leads = { status };
    }
  } else if (typeof managementRaw === "string" && managementRaw.trim()) {
    const mgmt = managementRaw.trim() as LeadManagementStatus;
    if (mgmt === "WON" || mgmt === "LOST" || mgmt === "CLOSED") {
      const existingLeads = next.leads;
      const mapped =
        mgmt === "WON" ? "WON" : mgmt === "LOST" ? "LOST" : "UNQUALIFIED";
      if (existingLeads && typeof existingLeads === "object" && !Array.isArray(existingLeads)) {
        next.leads = { ...(existingLeads as Record<string, unknown>), status: mapped };
      } else {
        next.leads = { status: mapped };
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "followUpAt")) {
    const v = payload.followUpAt;
    const at = v === null ? null : typeof v === "string" ? v : null;
    next.follow_up_at = at;
    next.followUpAt = at;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "followUpNote")) {
    const v = payload.followUpNote;
    const note = v === null ? null : typeof v === "string" ? v : null;
    next.follow_up_note = note;
    next.followUpNote = note;
  }

  return next as T;
}

export function mapLeadStatusSaveError(message: string): string {
  const t = message.trim();
  if (!t) return "Failed to update lead status.";
  const lower = t.toLowerCase();
  if (lower.includes("forbidden")) {
    return "You do not have permission to update lead status for this conversation.";
  }
  if (lower.includes("not found")) return "Conversation not found.";
  if (lower.includes("invalid lead management status transition")) {
    return "That lead status change is not allowed.";
  }
  if (lower.includes("invalid lead status")) return "Invalid lead status.";
  if (
    lower.includes("database error") ||
    lower.includes("pgrst") ||
    lower.includes("audit event failed")
  ) {
    return "Could not save lead status. Try again.";
  }
  if (t.length > 160 || lower.includes("detail:")) {
    return "Failed to update lead status.";
  }
  return t;
}
