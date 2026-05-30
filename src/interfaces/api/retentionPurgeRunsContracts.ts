import { z } from "zod";

/**
 * POST /api/retention/purge-runs body.
 * Snapshots are always computed server-side from the dry-run use case; client policy/summary/samples are rejected.
 */
export const CreateRetentionPurgeRunBodySchema = z
  .object({
    notes: z.string().max(2000).optional()
  })
  .strict();

export type CreateRetentionPurgeRunBody = z.infer<typeof CreateRetentionPurgeRunBodySchema>;

export function parseCreateRetentionPurgeRunBody(
  body: unknown
): { ok: true; value: CreateRetentionPurgeRunBody } | { ok: false; message: string } {
  const parsed = CreateRetentionPurgeRunBodySchema.safeParse(body);
  if (!parsed.success) {
    const hasSnapshotField = parsed.error.issues.some((issue) => issue.code === "unrecognized_keys");
    if (hasSnapshotField) {
      return {
        ok: false,
        message:
          "Request body must not include policy, summary, or samples; snapshots are generated server-side. Send optional notes only."
      };
    }
    return { ok: false, message: parsed.error.message };
  }
  return { ok: true, value: parsed.data };
}
