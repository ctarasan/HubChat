import { DEFAULT_RETENTION_POLICY } from "./retentionPolicy.js";

export const RETENTION_PURGE_EXECUTE_CONFIRM_TEXT = "EXECUTE RETENTION PURGE" as const;
export const RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS = "RAW_PAYLOADS" as const;

export const RETENTION_PURGE_EXECUTE_BATCH_DEFAULT = 100;
export const RETENTION_PURGE_EXECUTE_BATCH_MAX = 500;

export type RetentionPurgeExecuteTarget = typeof RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS;

export type RetentionPurgeExecuteResult = {
  target: RetentionPurgeExecuteTarget;
  batchLimit: number;
  affectedWebhookEvents: number;
  affectedMessageRawPayloads: number;
  generatedAt: string;
  policy: {
    archivedMediaRetentionDays: number;
    archivedMessageRetentionDays: number;
    rawPayloadRetentionDays: number;
  };
};

/** True only when HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED is explicitly enabled. */
export function isRetentionPurgeExecuteEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = env.HUBCHAT_RETENTION_PURGE_EXECUTE_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function parseRetentionPurgeExecuteBatchLimit(raw?: number): number {
  if (raw === undefined || !Number.isFinite(raw)) {
    return RETENTION_PURGE_EXECUTE_BATCH_DEFAULT;
  }
  const n = Math.floor(raw);
  if (n < 1) return RETENTION_PURGE_EXECUTE_BATCH_DEFAULT;
  return Math.min(RETENTION_PURGE_EXECUTE_BATCH_MAX, n);
}

export function buildRetentionPurgeExecuteResult(input: {
  batchLimit: number;
  affectedWebhookEvents: number;
  affectedMessageRawPayloads: number;
  generatedAt: string;
}): RetentionPurgeExecuteResult {
  return {
    target: RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS,
    batchLimit: input.batchLimit,
    affectedWebhookEvents: input.affectedWebhookEvents,
    affectedMessageRawPayloads: input.affectedMessageRawPayloads,
    generatedAt: input.generatedAt,
    policy: {
      archivedMediaRetentionDays: DEFAULT_RETENTION_POLICY.archivedMediaRetentionDays,
      archivedMessageRetentionDays: DEFAULT_RETENTION_POLICY.archivedMessageRetentionDays,
      rawPayloadRetentionDays: DEFAULT_RETENTION_POLICY.rawPayloadRetentionDays
    }
  };
}

const REDACTED_EMPTY_OBJECT = {};

export function emptyRedactedRawPayloadJson(): Record<string, never> {
  return REDACTED_EMPTY_OBJECT;
}

/** Sanitize execution errors for API/storage without leaking secrets or raw payloads. */
export function sanitizeRetentionPurgeExecutionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim().slice(0, 500);
  const lower = trimmed.toLowerCase();
  const blocked = ["access_token", "secret", "bearer", "jwt", "payload_json", "raw_payload"];
  for (const token of blocked) {
    if (lower.includes(token)) {
      return "Retention purge execute failed";
    }
  }
  return trimmed || "Retention purge execute failed";
}

export function assertRetentionPurgeExecuteResultLean(result: RetentionPurgeExecuteResult): void {
  const serialized = JSON.stringify(result).toLowerCase();
  const blocked = ["access_token", "secret_json", "bearer", "jwt", '"content"', "https://", "http://"];
  for (const token of blocked) {
    if (serialized.includes(token)) {
      throw new Error(`Retention purge execute result must not expose ${token}`);
    }
  }
}
