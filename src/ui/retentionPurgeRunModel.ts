import type { RetentionDryRunPolicy, RetentionDryRunSummary } from "./retentionDryRunModel.js";
import { formatRetentionDryRunGeneratedAt } from "./retentionDryRunModel.js";

export type RetentionPurgeRunRecord = {
  id: string;
  status: string;
  createdAt: string;
  notes: string | null;
  policy: RetentionDryRunPolicy;
  summary: RetentionDryRunSummary;
  /** When false, raw payload execute is disabled for this run (API hint). */
  canExecuteRawPayload?: boolean;
};

export const RETENTION_EXECUTE_CONFIRM_PHRASE = "EXECUTE RETENTION PURGE";
export const RETENTION_EXECUTE_TARGET_RAW_PAYLOADS = "RAW_PAYLOADS";
export const RETENTION_EXECUTE_DEFAULT_BATCH_LIMIT = 100;

export type RetentionRawPayloadExecuteResult = {
  affectedWebhookEvents: number | null;
  affectedMessageRawPayloads: number | null;
};

export type RetentionPurgeRunsListMeta = {
  rawPayloadExecutionEnabled: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
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

  const canExecuteRawPayload =
    parseOptionalBool(raw.canExecuteRawPayload ?? raw.can_execute_raw_payload) ??
    parseOptionalBool(raw.rawPayloadExecutionEnabled ?? raw.raw_payload_execution_enabled);

  return {
    id,
    status,
    createdAt,
    notes: sanitizeRetentionAuditNotes(raw.notes ?? raw.note),
    policy,
    summary,
    ...(canExecuteRawPayload !== undefined ? { canExecuteRawPayload } : {})
  };
}

function readListMeta(body: Record<string, unknown>): RetentionPurgeRunsListMeta {
  const meta = isRecord(body.meta) ? body.meta : isRecord(body.pageInfo) ? body.pageInfo : null;
  const enabled =
    meta?.rawPayloadExecutionEnabled ??
    meta?.raw_payload_execution_enabled ??
    meta?.executionEnabled ??
    meta?.execution_enabled;
  const parsed = parseOptionalBool(enabled);
  return { rawPayloadExecutionEnabled: parsed !== false };
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
): { ok: true; runs: RetentionPurgeRunRecord[]; meta: RetentionPurgeRunsListMeta } | { ok: false; error: string } {
  const rows = extractRunsArray(body);
  if (!rows) {
    return { ok: false, error: "Invalid retention purge runs response." };
  }
  const runs: RetentionPurgeRunRecord[] = [];
  for (const row of rows) {
    const parsed = parsePurgeRunRecord(row);
    if (parsed) runs.push(parsed);
  }
  const meta = isRecord(body) ? readListMeta(body) : { rawPayloadExecutionEnabled: true };
  return { ok: true, runs, meta };
}

export function isRetentionExecuteConfirmValid(confirmText: string): boolean {
  return confirmText === RETENTION_EXECUTE_CONFIRM_PHRASE;
}

export function canExecuteRawPayloadForRun(
  run: RetentionPurgeRunRecord,
  meta: RetentionPurgeRunsListMeta
): boolean {
  if (!meta.rawPayloadExecutionEnabled) return false;
  if (run.canExecuteRawPayload === false) return false;
  const status = run.status.trim().toUpperCase();
  if (status !== "DRY_RUN_SNAPSHOT") return false;
  return true;
}

/** POST /api/retention/purge-runs/[id]/execute body (raw payload cleanup only). */
export function buildRetentionRawPayloadExecuteBody(confirmText: string): Record<string, unknown> {
  return {
    target: RETENTION_EXECUTE_TARGET_RAW_PAYLOADS,
    confirmText,
    batchLimit: RETENTION_EXECUTE_DEFAULT_BATCH_LIMIT
  };
}

function readOptionalCount(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = readNonNegativeInt(source[key]);
    if (n !== null) return n;
  }
  return null;
}

export function parseRetentionRawPayloadExecuteResponse(
  body: unknown
): { ok: true; result: RetentionRawPayloadExecuteResult } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: "Invalid execute response." };
  }
  const raw = isRecord(body.data) ? body.data : body;
  const executionResult = isRecord(raw.executionResult)
    ? raw.executionResult
    : isRecord(raw.execution_result)
      ? raw.execution_result
      : raw;
  const result: RetentionRawPayloadExecuteResult = {
    affectedWebhookEvents: readOptionalCount(
      executionResult,
      "affectedWebhookEvents",
      "affected_webhook_events"
    ),
    affectedMessageRawPayloads: readOptionalCount(
      executionResult,
      "affectedMessageRawPayloads",
      "affected_message_raw_payloads"
    )
  };
  return { ok: true, result };
}

export function formatRetentionRawPayloadExecuteResult(result: RetentionRawPayloadExecuteResult): string {
  const parts: string[] = [];
  if (result.affectedWebhookEvents !== null) {
    parts.push(`Webhook events affected: ${result.affectedWebhookEvents}`);
  }
  if (result.affectedMessageRawPayloads !== null) {
    parts.push(`Message raw payloads affected: ${result.affectedMessageRawPayloads}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Raw payload cleanup completed.";
}

export function mapRetentionRawPayloadExecuteError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) {
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
    return "Raw payload cleanup execution is disabled.";
  }
  if (status === 503) {
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
      const err = body.error.trim();
      if (err.length <= 200 && !err.toLowerCase().includes("pgrst")) return err;
    }
    return "Raw payload cleanup execution is disabled.";
  }
  if (status === 404) return "Retention execute API is not available yet.";
  if (status === 400) {
    if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
      const err = body.error.trim();
      if (err.length <= 200 && !err.toLowerCase().includes("pgrst")) return err;
    }
    return "Could not execute raw payload cleanup. Check confirmation phrase and run status.";
  }
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    const err = body.error.trim();
    if (err.length <= 200 && !err.toLowerCase().includes("pgrst")) return err;
  }
  if (status >= 500) return "Could not execute raw payload cleanup. Try again shortly.";
  return `Could not execute raw payload cleanup (HTTP ${status}).`;
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

/** POST body: optional notes only; server recomputes dry-run snapshot. */
export function buildRetentionPurgeRunSnapshotBody(notes?: string): Record<string, unknown> {
  const safeNotes = sanitizeRetentionAuditNotes(notes);
  if (!safeNotes) {
    return {};
  }
  return { notes: safeNotes };
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
