/**
 * Pure helpers for Team Inbox SLA / follow-up / waiting presentation (Phase II-C2+ UI).
 * No I/O; safe for unit tests with injected `now`.
 */

export type SlaBucket = "none" | "overdue" | "dueSoon" | "ok";

export type FollowUpBucket = "none" | "overdue" | "today" | "upcoming";

export type ConversationWaitingKind = "waitingOnUs" | "waitingOnCustomer" | "noRecentMessage" | "unknown";

/** Default “due soon” window before `slaDueAt` when still on track (2 hours). */
export const DEFAULT_SLA_DUE_SOON_MS = 2 * 60 * 60 * 1000;

export type ComputeSlaBucketOptions = {
  /** Milliseconds before `slaDueAt` to classify as `dueSoon` (exclusive of overdue). */
  dueSoonMs?: number;
};

function utcCalendarDayIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Canonical SLA deadline bucket using stored `sla_due_at`.
 * - `none`: no deadline configured
 * - `overdue`: past deadline
 * - `dueSoon`: deadline in the future but within `dueSoonMs`
 * - `ok`: deadline further out than `dueSoonMs`
 */
export function computeSlaBucket(now: Date, slaDueAt: Date | null, options?: ComputeSlaBucketOptions): SlaBucket {
  if (!slaDueAt) return "none";
  const t = slaDueAt.getTime();
  if (Number.isNaN(t)) return "none";
  const nowMs = now.getTime();
  if (nowMs > t) return "overdue";
  const dueSoonMs = options?.dueSoonMs ?? DEFAULT_SLA_DUE_SOON_MS;
  if (t <= nowMs + dueSoonMs) return "dueSoon";
  return "ok";
}

/**
 * Follow-up bucket using stored `follow_up_at` (timestamp semantics).
 * - `overdue`: now is after the scheduled follow-up instant
 * - `today`: same UTC calendar day as `followUpAt`, and not overdue
 * - `upcoming`: any future calendar day after today (UTC)
 */
export function computeFollowUpBucket(now: Date, followUpAt: Date | null): FollowUpBucket {
  if (!followUpAt) return "none";
  if (Number.isNaN(followUpAt.getTime())) return "none";
  if (now.getTime() > followUpAt.getTime()) return "overdue";
  const d0 = utcCalendarDayIso(now);
  const d1 = utcCalendarDayIso(followUpAt);
  if (d0 === d1) return "today";
  if (d1 > d0) return "upcoming";
  return "overdue";
}

/**
 * Waiting heuristic from denormalized conversation timestamps (when maintained).
 * Compares last customer vs last agent message instants only.
 */
export function computeWaitingState(
  lastCustomerMessageAt: Date | null,
  lastAgentMessageAt: Date | null
): ConversationWaitingKind {
  const c = lastCustomerMessageAt;
  const a = lastAgentMessageAt;
  if (!c && !a) return "noRecentMessage";
  if (c && !a) return "waitingOnUs";
  if (!c && a) return "waitingOnCustomer";
  const ct = c!.getTime();
  const at = a!.getTime();
  if (Number.isNaN(ct) || Number.isNaN(at)) return "unknown";
  if (ct > at) return "waitingOnUs";
  if (at > ct) return "waitingOnCustomer";
  return "unknown";
}
