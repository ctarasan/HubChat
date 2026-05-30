import type { RetentionDryRunPolicy, RetentionDryRunReport, RetentionDryRunSummary } from "./retentionDryRunModel.js";
import { formatRetentionDryRunGeneratedAt } from "./retentionDryRunModel.js";

export type RetentionPurgeRunRecord = {
  id: string;
  status: string;
  createdAt: string;
  notes: string | null;
  policy: RetentionDryRunPolicy;
  summary: RetentionDryRunSummary;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function readNonNegativeInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

function readSummaryCount(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const n = readNonNegativeInt(source[key]);
    if (n !== null) return n;
  }
  return 0;
}

function readOptionalSummaryCount(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (source[key] === undefined || source[key] === null) continue;
    const n = readNonNegativeInt(source[key]);
    if (n !== null) return n;
  }
  return null;
}

function readPolicy(raw: unknown): RetentionDryRunPolicy | null {
  if (!isRecord(raw)) return null;
  const archivedMediaRetentionDays = readNonNegativeInt(
    raw.archivedMediaRetentionDays ?? raw.archived_media_retention_days
  );
  const archivedMessageRetentionDays = readNonNegativeInt(
    raw.archivedMessageRetentionDays ?? raw.archived_message_retention_days
  );
  const rawPayloadRetentionDays = readNonNegativeInt(
    raw.rawPayloadRetentionDays ?? raw.raw_payload_retention_days
  );
  if (
    archivedMediaRetentionDays === null ||
    archivedMessageRetentionDays === null ||
    rawPayloadRetentionDays === null
  ) {
    return null;
  }
  return { archivedMediaRetentionDays, archivedMessageRetentionDays, rawPayloadRetentionDays };
}

function readSummary(raw: unknown): RetentionDryRunSummary | null {
  if (!isRecord(raw)) return null;
  return {
    mediaPurgeCandidates: readSummaryCount(
      raw,
      "mediaPurgeCandidates",
      "media_purge_candidates",
      "mediaPurgeCandidateCount"
    ),
    messageHistoryPurgeCandidates: readSummaryCount(
      raw,
      "messageHistoryPurgeCandidates",
      "message_history_purge_candidates",
      "messagePurgeCandidates",
      "message_purge_candidates"
    ),
    estimatedMessagesEligible: readSummaryCount(raw, "estimatedMessagesEligible", "estimated_messages_eligible"),
    estimatedMediaAttachmentsEligible: readSummaryCount(
      raw,
      "estimatedMediaAttachmentsEligible",
      "estimated_media_attachments_eligible"
    ),
    rawPayloadCandidates: readOptionalSummaryCount(
      raw,
      "rawPayloadCandidates",
      "raw_payload_candidates",
      "rawPayloadCandidateCount"
    )
  };
}

function looksLikeUnsafeAuditText(value: string): boolean {
  const lower = value.toLowerCase();
  if (/^https?:\/\//i.test(value)) return true;
  if (lower.includes("bearer ") || lower.includes("jwt") || lower.includes("access_token")) return true;
  if (lower.includes("secret") || lower.includes("password")) return true;
  return value.length > 500;
}

/** Safe notes for audit list display. */
export function sanitizeRetentionAuditNotes(value: unknown): string | null {
  const s = normalizeString(value);
  if (!s || looksLikeUnsafeAuditText(s)) return null;
  return s;
}

function parsePurgeRunRecord(raw: unknown): RetentionPurgeRunRecord | null {
  if (!isRecord(raw)) return null;
  const id = normalizeString(raw.id) || normalizeString(raw.runId) || normalizeString(raw.run_id);
  const status = normalizeString(raw.status) || "UNKNOWN";
  const createdAt =
    normalizeString(raw.createdAt) ||
    normalizeString(raw.created_at) ||
    normalizeString(raw.createdAtIso);
  if (!id || !createdAt || Number.isNaN(Date.parse(createdAt))) return null;

  const policy = readPolicy(raw.policy ?? raw.policySnapshot ?? raw.policy_snapshot);
  const summary = readSummary(raw.summary ?? raw.summarySnapshot ?? raw.summary_snapshot);
  if (!policy || !summary) return null;

  return {
    id,
    status,
    createdAt,
    notes: sanitizeRetentionAuditNotes(raw.notes ?? raw.note),
    policy,
    summary
  };
}

function extractRunsArray(body: unknown): unknown[] | null {
  if (!isRecord(body)) return null;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.runs)) return body.runs;
  if (Array.isArray(body.items)) return body.items;
  if (isRecord(body.data) && Array.isArray(body.data.runs)) return body.data.runs;
  if (Array.isArray(body)) return body;
  return null;
}

export function parseRetentionPurgeRunsListResponse(
  body: unknown
): { ok: true; runs: RetentionPurgeRunRecord[] } | { ok: false; error: string } {
  const rows = extractRunsArray(body);
  if (!rows) {
    return { ok: false, error: "Invalid retention purge runs response." };
  }
  const runs: RetentionPurgeRunRecord[] = [];
  for (const row of rows) {
    const parsed = parsePurgeRunRecord(row);
    if (parsed) runs.push(parsed);
  }
  return { ok: true, runs };
}

export function parseRetentionPurgeRunCreateResponse(
  body: unknown
): { ok: true; run: RetentionPurgeRunRecord } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid snapshot save response." };
  }
  const raw = isRecord(body.data) ? body.data : body;
  const run = parsePurgeRunRecord(raw);
  if (!run) {
    return { ok: false, error: "Invalid snapshot save response: run record missing." };
  }
  return { ok: true, run };
}

/** POST body: audit snapshot from current dry-run (no purge execution). */
export function buildRetentionPurgeRunSnapshotBody(
  report: RetentionDryRunReport,
  notes?: string
): Record<string, unknown> {
  const safeNotes = notes?.trim();
  return {
    policy: report.policy,
    generatedAt: report.generatedAt,
    summary: report.summary,
    ...(safeNotes ? { notes: safeNotes } : {})
  };
}

export function mapRetentionPurgeRunsFetchError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "Retention audit snapshots are available to Admins only.";
  if (status === 404) return "Retention purge runs API is not available yet.";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    const err = body.error.trim();
    if (err.length <= 160 && !err.toLowerCase().includes("pgrst")) return err;
  }
  if (status >= 500) return "Could not load retention audit snapshots. Try again shortly.";
  return `Could not load retention audit snapshots (HTTP ${status}).`;
}

export function mapRetentionPurgeRunSaveError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "Saving audit snapshots requires Admin access.";
  if (status === 404) return "Retention purge runs API is not available yet.";
  if (status === 400) {
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
    return "Could not save snapshot. Load a dry-run report first.";
  }
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    const err = body.error.trim();
    if (err.length <= 160 && !err.toLowerCase().includes("pgrst")) return err;
  }
  if (status >= 500) return "Could not save audit snapshot. Try again shortly.";
  return `Could not save audit snapshot (HTTP ${status}).`;
}

export function formatRetentionPurgeRunStatus(status: string): string {
  const normalized = status.trim().replaceAll("_", " ").toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRetentionPurgeRunCreatedAt(iso: string): string {
  return formatRetentionDryRunGeneratedAt(iso);
}
