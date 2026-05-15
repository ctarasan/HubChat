import {
  computeFollowUpBucket,
  computeSlaBucket,
  computeWaitingState
} from "../domain/conversationInboxBuckets.js";

export type InboxBadgeInput = {
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  sla_due_at?: string | null;
  last_customer_message_at?: string | null;
  last_agent_message_at?: string | null;
};

export type InboxBadgeDescriptor = {
  label: string;
  className: string;
  /** Tooltip on follow-up-related badges when a note exists */
  title?: string;
};

export function parseIsoToDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function followUpNoteTitle(note: unknown): string | undefined {
  if (typeof note !== "string") return undefined;
  const t = note.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * At most two badges per lead row. Priority:
 * 1 SLA overdue → 2 Follow-up overdue → 3 Follow-up today → 4 SLA due soon →
 * 5 Waiting on us → 6 Waiting on customer → 7 Follow-up upcoming
 */
export function resolveInboxBadgeDescriptors(now: Date, input: InboxBadgeInput): InboxBadgeDescriptor[] {
  const out: InboxBadgeDescriptor[] = [];
  const push = (d: InboxBadgeDescriptor) => {
    if (out.length < 2) out.push(d);
  };

  const noteTitle = followUpNoteTitle(input.follow_up_note);
  const slaAt = parseIsoToDate(input.sla_due_at);
  const fuAt = parseIsoToDate(input.follow_up_at);
  const lc = parseIsoToDate(input.last_customer_message_at);
  const la = parseIsoToDate(input.last_agent_message_at);

  const slaBucket = slaAt ? computeSlaBucket(now, slaAt) : null;
  const fuBucket = fuAt ? computeFollowUpBucket(now, fuAt) : null;
  const waiting = computeWaitingState(lc, la);

  if (slaBucket === "overdue") push({ label: "SLA overdue", className: "inbox-badge inbox-badge-sla inbox-badge-sla-overdue" });
  if (out.length >= 2) return out;
  if (fuBucket === "overdue") {
    push({
      label: "Follow-up overdue",
      className: "inbox-badge inbox-badge-followup inbox-badge-followup-overdue",
      title: noteTitle
    });
  }
  if (out.length >= 2) return out;
  if (fuBucket === "today") {
    push({
      label: "Follow-up today",
      className: "inbox-badge inbox-badge-followup inbox-badge-followup-today",
      title: noteTitle
    });
  }
  if (out.length >= 2) return out;
  if (slaBucket === "dueSoon") push({ label: "SLA due soon", className: "inbox-badge inbox-badge-sla inbox-badge-sla-due-soon" });
  if (out.length >= 2) return out;
  if (waiting === "waitingOnUs") push({ label: "Waiting on us", className: "inbox-badge inbox-badge-waiting inbox-badge-waiting-us" });
  if (out.length >= 2) return out;
  if (waiting === "waitingOnCustomer") {
    push({ label: "Waiting on customer", className: "inbox-badge inbox-badge-waiting inbox-badge-waiting-customer" });
  }
  if (out.length >= 2) return out;
  if (fuBucket === "upcoming") {
    push({
      label: "Follow-up upcoming",
      className: "inbox-badge inbox-badge-followup inbox-badge-followup-upcoming",
      title: noteTitle
    });
  }
  return out;
}

/** Read-only header line for the selected conversation. */
export function formatFollowUpHeaderLine(input: InboxBadgeInput): string | null {
  const at = parseIsoToDate(input.follow_up_at);
  const note = typeof input.follow_up_note === "string" ? input.follow_up_note.trim() : "";
  if (!at && !note) return null;
  const atPart = at ? `Follow-up: ${at.toISOString().replace("T", " ").slice(0, 19)} UTC` : null;
  if (atPart && note) return `${atPart} — ${note}`;
  if (atPart) return atPart;
  return `Follow-up note: ${note}`;
}
