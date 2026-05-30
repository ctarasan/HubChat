export type RetentionDryRunPolicy = {
  archivedMediaRetentionDays: number;
  archivedMessageRetentionDays: number;
  rawPayloadRetentionDays: number;
};

export type RetentionDryRunSummary = {
  mediaPurgeCandidates: number;
  messageHistoryPurgeCandidates: number;
  estimatedMessagesEligible: number;
  estimatedMediaAttachmentsEligible: number;
  rawPayloadCandidates: number | null;
};

export type RetentionDryRunSampleRow = Record<string, string | number>;

export type RetentionDryRunReport = {
  policy: RetentionDryRunPolicy;
  generatedAt: string;
  summary: RetentionDryRunSummary;
  samples: {
    mediaPurgeCandidates: RetentionDryRunSampleRow[];
    messagePurgeCandidates: RetentionDryRunSampleRow[];
  };
};

/** Safe keys only — no message body, media URLs, raw payloads, or secrets. */
export const RETENTION_SAMPLE_SAFE_KEYS = [
  "id",
  "leadId",
  "conversationId",
  "tenantId",
  "channel",
  "channelType",
  "archivedAt",
  "conversationArchivedAt",
  "purgeEligibleAt",
  "eligibleAt",
  "messageCount",
  "attachmentCount",
  "mediaAttachmentCount",
  "status",
  "inboxState",
  "externalUserIdPreview"
] as const;

const SAMPLE_KEY_ALIASES: Record<string, (typeof RETENTION_SAMPLE_SAFE_KEYS)[number]> = {
  id: "id",
  lead_id: "leadId",
  leadid: "leadId",
  conversation_id: "conversationId",
  conversationid: "conversationId",
  tenant_id: "tenantId",
  tenantid: "tenantId",
  channel_type: "channelType",
  channeltype: "channelType",
  archived_at: "archivedAt",
  archivedat: "archivedAt",
  conversation_archived_at: "conversationArchivedAt",
  purge_eligible_at: "purgeEligibleAt",
  eligible_at: "eligibleAt",
  message_count: "messageCount",
  attachment_count: "attachmentCount",
  media_attachment_count: "mediaAttachmentCount",
  inbox_state: "inboxState",
  external_user_id_preview: "externalUserIdPreview"
};

const BLOCKED_SAMPLE_KEY_PARTS = [
  "content",
  "message",
  "body",
  "preview",
  "url",
  "payload",
  "secret",
  "token",
  "password",
  "credential",
  "raw",
  "metadata",
  "profile",
  "image",
  "media_path",
  "attachment_url"
];

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

function isBlockedSampleKey(key: string): boolean {
  if ((RETENTION_SAMPLE_SAFE_KEYS as readonly string[]).includes(key)) return false;
  if (SAMPLE_KEY_ALIASES[key.toLowerCase()]) return false;
  const lower = key.toLowerCase();
  return BLOCKED_SAMPLE_KEY_PARTS.some((part) => lower.includes(part));
}

function looksLikeUnsafeStringValue(value: string): boolean {
  const lower = value.toLowerCase();
  if (/^https?:\/\//i.test(value)) return true;
  if (lower.includes("access_token") || lower.includes("secret") || lower.includes("bearer ")) return true;
  if (value.length > 200) return true;
  return false;
}

function canonicalSampleKey(key: string): (typeof RETENTION_SAMPLE_SAFE_KEYS)[number] | null {
  if (isBlockedSampleKey(key)) return null;
  if ((RETENTION_SAMPLE_SAFE_KEYS as readonly string[]).includes(key)) {
    return key as (typeof RETENTION_SAMPLE_SAFE_KEYS)[number];
  }
  const alias = SAMPLE_KEY_ALIASES[key.toLowerCase()];
  return alias ?? null;
}

/** Strips unsafe fields from a dry-run sample row before display. */
export function sanitizeRetentionDryRunSampleRow(raw: unknown): RetentionDryRunSampleRow | null {
  if (!isRecord(raw)) return null;
  const out: RetentionDryRunSampleRow = {};
  for (const [key, value] of Object.entries(raw)) {
    const safeKey = canonicalSampleKey(key);
    if (!safeKey) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[safeKey] = Math.max(0, Math.floor(value));
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || looksLikeUnsafeStringValue(trimmed)) continue;
      out[safeKey] = trimmed;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function readSampleRows(raw: unknown): RetentionDryRunSampleRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: RetentionDryRunSampleRow[] = [];
  for (const item of raw) {
    const sanitized = sanitizeRetentionDryRunSampleRow(item);
    if (sanitized) rows.push(sanitized);
  }
  return rows;
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
  const mediaPurgeCandidates = readSummaryCount(
    raw,
    "mediaPurgeCandidates",
    "media_purge_candidates",
    "mediaPurgeCandidateCount",
    "media_purge_candidate_count"
  );
  const messageHistoryPurgeCandidates = readSummaryCount(
    raw,
    "messageHistoryPurgeCandidates",
    "message_history_purge_candidates",
    "messagePurgeCandidates",
    "message_purge_candidates",
    "messagePurgeCandidateCount",
    "message_purge_candidate_count"
  );
  const estimatedMessagesEligible = readSummaryCount(
    raw,
    "estimatedMessagesEligible",
    "estimated_messages_eligible"
  );
  const estimatedMediaAttachmentsEligible = readSummaryCount(
    raw,
    "estimatedMediaAttachmentsEligible",
    "estimated_media_attachments_eligible"
  );
  const rawPayloadCandidates = readOptionalSummaryCount(
    raw,
    "rawPayloadCandidates",
    "raw_payload_candidates",
    "rawPayloadCandidateCount",
    "raw_payload_candidate_count"
  );
  return {
    mediaPurgeCandidates,
    messageHistoryPurgeCandidates,
    estimatedMessagesEligible,
    estimatedMediaAttachmentsEligible,
    rawPayloadCandidates
  };
}

function unwrapDryRunRoot(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.policy) || isRecord(body.summary)) return body;
  if (isRecord(body.data)) return body.data;
  return null;
}

export function parseRetentionDryRunResponse(
  body: unknown
): { ok: true; report: RetentionDryRunReport } | { ok: false; error: string } {
  const root = unwrapDryRunRoot(body);
  if (!root) {
    return { ok: false, error: "Invalid retention dry-run response." };
  }
  const policy = readPolicy(root.policy);
  if (!policy) {
    return { ok: false, error: "Invalid retention dry-run response: policy missing or invalid." };
  }
  const generatedAt =
    normalizeString(root.generatedAt) || normalizeString(root.generated_at);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    return { ok: false, error: "Invalid retention dry-run response: generatedAt missing or invalid." };
  }
  const summary = readSummary(root.summary);
  if (!summary) {
    return { ok: false, error: "Invalid retention dry-run response: summary missing or invalid." };
  }
  const samplesRaw = isRecord(root.samples) ? root.samples : {};
  const mediaPurgeCandidates = readSampleRows(
    samplesRaw.mediaPurgeCandidates ?? samplesRaw.media_purge_candidates
  );
  const messagePurgeCandidates = readSampleRows(
    samplesRaw.messagePurgeCandidates ??
      samplesRaw.message_purge_candidates ??
      samplesRaw.messageHistoryPurgeCandidates ??
      samplesRaw.message_history_purge_candidates
  );
  return {
    ok: true,
    report: {
      policy,
      generatedAt,
      summary,
      samples: { mediaPurgeCandidates, messagePurgeCandidates }
    }
  };
}

export function mapRetentionDryRunFetchError(status: number, body: unknown): string {
  if (status === 401) return "Sign in required. Your session may have expired.";
  if (status === 403) return "Retention dry-run is available to Admins only.";
  if (status === 404) return "Retention dry-run API is not available yet.";
  if (isRecord(body) && typeof body.error === "string" && body.error.trim()) {
    const err = body.error.trim();
    if (err.length <= 160 && !err.toLowerCase().includes("pgrst")) return err;
  }
  if (status >= 500) return "Could not load retention dry-run. Try again shortly.";
  return `Could not load retention dry-run (HTTP ${status}).`;
}

export function formatRetentionDryRunGeneratedAt(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export function retentionSampleColumnKeys(rows: RetentionDryRunSampleRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if ((RETENTION_SAMPLE_SAFE_KEYS as readonly string[]).includes(key)) seen.add(key);
    }
  }
  const ordered = RETENTION_SAMPLE_SAFE_KEYS.filter((k) => seen.has(k));
  return ordered.length > 0 ? ordered : ["id"];
}

export function retentionSampleColumnLabel(key: string): string {
  const labels: Record<string, string> = {
    leadId: "Lead ID",
    conversationId: "Conversation ID",
    tenantId: "Tenant ID",
    channelType: "Channel",
    archivedAt: "Archived at",
    conversationArchivedAt: "Conversation archived",
    purgeEligibleAt: "Purge eligible",
    eligibleAt: "Eligible at",
    messageCount: "Messages",
    attachmentCount: "Attachments",
    mediaAttachmentCount: "Media attachments",
    inboxState: "Inbox state",
    externalUserIdPreview: "External ID"
  };
  return labels[key] ?? key;
}

export function formatRetentionSampleCell(value: string | number | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "number") return String(value);
  return value;
}
