import { z } from "zod";
import {
  RETENTION_PURGE_EXECUTE_BATCH_MAX,
  RETENTION_PURGE_EXECUTE_CONFIRM_TEXT,
  RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS,
  parseRetentionPurgeExecuteBatchLimit
} from "../../lib/retentionPurgeExecute.js";

export const ExecuteRetentionPurgeRunBodySchema = z
  .object({
    target: z.literal(RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS),
    confirmText: z.literal(RETENTION_PURGE_EXECUTE_CONFIRM_TEXT),
    batchLimit: z.number().int().min(1).max(RETENTION_PURGE_EXECUTE_BATCH_MAX).optional()
  })
  .strict();

export type ExecuteRetentionPurgeRunBody = z.infer<typeof ExecuteRetentionPurgeRunBodySchema>;

export function parseExecuteRetentionPurgeRunBody(
  body: unknown
): { ok: true; value: { batchLimit: number } } | { ok: false; message: string } {
  const parsed = ExecuteRetentionPurgeRunBodySchema.safeParse(body);
  if (!parsed.success) {
    const hasExtra = parsed.error.issues.some((i) => i.code === "unrecognized_keys");
    if (hasExtra) {
      return { ok: false, message: "Request body must only include target, confirmText, and optional batchLimit" };
    }
    const confirmIssue = parsed.error.issues.find((i) => i.path.join(".") === "confirmText");
    if (confirmIssue) {
      return { ok: false, message: `confirmText must be exactly: ${RETENTION_PURGE_EXECUTE_CONFIRM_TEXT}` };
    }
    const targetIssue = parsed.error.issues.find((i) => i.path.join(".") === "target");
    if (targetIssue) {
      return { ok: false, message: `target must be ${RETENTION_PURGE_EXECUTE_TARGET_RAW_PAYLOADS}` };
    }
    return { ok: false, message: parsed.error.message };
  }
  return {
    ok: true,
    value: { batchLimit: parseRetentionPurgeExecuteBatchLimit(parsed.data.batchLimit) }
  };
}
