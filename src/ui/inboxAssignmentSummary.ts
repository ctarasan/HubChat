/**
 * Presentation-only inbox assignment/priority summary.
 * Does not mutate assignment or priority domain values.
 */

export type InboxAssignmentSummaryInput = {
  /** Resolved display label when an assignee exists; null/empty means unassigned. */
  assignedDisplayName: string | null | undefined;
  assignmentStatus?: string | null;
  priority?: string | null;
};

function normalizeToken(value: string | null | undefined, fallback: string): string {
  const t = typeof value === "string" ? value.trim() : "";
  return t.length > 0 ? t : fallback;
}

/**
 * Formats the Inbox card / chat-header assignment line.
 *
 * - Assigned with name → `Assigned: <name>` (hides redundant `ASSIGNED` and `NORMAL`)
 * - Unassigned → `Unassigned` (hides redundant `UNASSIGNED` and `NORMAL`)
 * - Keeps non-default status (e.g. REASSIGNED, UNASSIGNED_AGAIN) and non-NORMAL priority
 * - Never emits dangling ` · ` separators
 */
export function formatInboxAssignmentSummary(input: InboxAssignmentSummaryInput): string {
  const name = typeof input.assignedDisplayName === "string" ? input.assignedDisplayName.trim() : "";
  const hasAssignee = name.length > 0;
  const status = normalizeToken(input.assignmentStatus, hasAssignee ? "ASSIGNED" : "UNASSIGNED");
  const priority = normalizeToken(input.priority, "NORMAL");

  const parts: string[] = [];

  if (hasAssignee) {
    parts.push(`Assigned: ${name}`);
    // Name already implies assignment; hide literal ASSIGNED / UNASSIGNED.
    if (status !== "ASSIGNED" && status !== "UNASSIGNED") {
      parts.push(status);
    }
  } else {
    parts.push("Unassigned");
    if (status !== "UNASSIGNED" && status !== "ASSIGNED") {
      parts.push(status);
    }
  }

  if (priority !== "NORMAL") {
    parts.push(priority);
  }

  return parts.join(" · ");
}
