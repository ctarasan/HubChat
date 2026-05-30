/** Default retention windows for dry-run reporting (no enforcement in this phase). */
export const DEFAULT_RETENTION_POLICY = {
  archivedMediaRetentionDays: 90,
  archivedMessageRetentionDays: 365,
  rawPayloadRetentionDays: 90,
  dryRunMaxSampleRows: 20
} as const;

export type RetentionPolicyConfig = typeof DEFAULT_RETENTION_POLICY;

export function subtractRetentionDays(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
