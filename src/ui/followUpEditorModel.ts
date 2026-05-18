import { computeFollowUpBucket } from "../domain/conversationInboxBuckets.js";
import { parseIsoToDate } from "./inboxBadgeLabels.js";

/** Matches `PatchConversationFollowUpSchema` note max. */
export const FOLLOW_UP_NOTE_MAX_LENGTH = 5000;

export type FollowUpSaveDraft = {
  atLocal: string;
  note: string;
};

export type FollowUpPatchBody = {
  followUpAt?: string | null;
  followUpNote?: string | null;
};

export type FollowUpStateDescriptor = {
  label: string;
  className: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO instant → value for `<input type="datetime-local" />` (local wall time). */
export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `datetime-local` value (local wall time) → ISO UTC for API. */
export function datetimeLocalValueToIso(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function followUpDraftFromConversationFields(input: {
  follow_up_at?: string | null;
  followUpAt?: string | null;
  follow_up_note?: string | null;
  followUpNote?: string | null;
}): FollowUpSaveDraft {
  const atRaw = (input.follow_up_at ?? input.followUpAt ?? "") as string;
  const noteRaw = (input.follow_up_note ?? input.followUpNote ?? "") as string;
  return {
    atLocal: isoToDatetimeLocalValue(typeof atRaw === "string" ? atRaw : null),
    note: typeof noteRaw === "string" ? noteRaw : ""
  };
}

export function getFollowUpStateDescriptor(now: Date, followUpAtIso: string | null | undefined): FollowUpStateDescriptor {
  const at = parseIsoToDate(followUpAtIso ?? null);
  if (!at) {
    return { label: "No follow-up", className: "followup-state followup-state-none" };
  }
  const bucket = computeFollowUpBucket(now, at);
  if (bucket === "overdue") {
    return { label: "Follow-up overdue", className: "followup-state followup-state-overdue" };
  }
  if (bucket === "today") {
    return { label: "Due today", className: "followup-state followup-state-today" };
  }
  if (bucket === "upcoming") {
    return { label: "Follow-up scheduled", className: "followup-state followup-state-upcoming" };
  }
  return { label: "Follow-up scheduled", className: "followup-state followup-state-upcoming" };
}

export function validateFollowUpSaveDraft(draft: FollowUpSaveDraft): string | null {
  if (draft.atLocal.trim()) {
    if (!datetimeLocalValueToIso(draft.atLocal)) return "Invalid follow-up date and time.";
    return null;
  }
  if (draft.note.trim()) return null;
  return "Add a follow-up date or note, or use Clear follow-up.";
}

export function buildFollowUpSavePatch(draft: FollowUpSaveDraft): FollowUpPatchBody {
  const validation = validateFollowUpSaveDraft(draft);
  if (validation) throw new Error(validation);

  const atLocal = draft.atLocal.trim();
  const noteTrim = draft.note.trim();

  const body: FollowUpPatchBody = {};
  if (!atLocal) {
    body.followUpAt = null;
  } else {
    const iso = datetimeLocalValueToIso(atLocal);
    if (!iso) throw new Error("Invalid follow-up date and time.");
    body.followUpAt = iso;
  }
  body.followUpNote = noteTrim.length > 0 ? noteTrim.slice(0, FOLLOW_UP_NOTE_MAX_LENGTH) : null;
  return body;
}

export function buildFollowUpClearPatch(): FollowUpPatchBody {
  return { followUpAt: null, followUpNote: null };
}

export function mergeConversationFollowUpFromPayload<T extends Record<string, unknown>>(
  row: T,
  payload: Record<string, unknown>
): T {
  const next = { ...row };
  if (Object.prototype.hasOwnProperty.call(payload, "followUpAt")) {
    const v = payload.followUpAt;
    const at = v === null ? null : typeof v === "string" ? v : null;
    (next as Record<string, unknown>).follow_up_at = at;
    (next as Record<string, unknown>).followUpAt = at;
  } else if (Object.prototype.hasOwnProperty.call(payload, "follow_up_at")) {
    const v = payload.follow_up_at;
    const at = v === null ? null : typeof v === "string" ? v : null;
    (next as Record<string, unknown>).follow_up_at = at;
    (next as Record<string, unknown>).followUpAt = at;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "followUpNote")) {
    const v = payload.followUpNote;
    const note = v === null ? null : typeof v === "string" ? v : null;
    (next as Record<string, unknown>).follow_up_note = note;
    (next as Record<string, unknown>).followUpNote = note;
  } else if (Object.prototype.hasOwnProperty.call(payload, "follow_up_note")) {
    const v = payload.follow_up_note;
    const note = v === null ? null : typeof v === "string" ? v : null;
    (next as Record<string, unknown>).follow_up_note = note;
    (next as Record<string, unknown>).followUpNote = note;
  }
  return next;
}

export function conversationFollowUpPatchPath(conversationId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}/follow-up`;
}
