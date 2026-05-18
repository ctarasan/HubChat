/**
 * Default first-response SLA window from the latest customer message (24 hours).
 * Not tenant-configurable in Phase II-C3; replace with settings DB in a later phase.
 */
export const DEFAULT_FIRST_RESPONSE_SLA_MS = 24 * 60 * 60 * 1000;

/** Compute `sla_due_at` from the customer message instant that starts the response clock. */
export function computeSlaDueAtFromCustomerMessage(
  customerMessageAt: Date,
  options?: { slaMs?: number }
): Date | null {
  const base = customerMessageAt.getTime();
  if (Number.isNaN(base)) return null;
  const slaMs = options?.slaMs ?? DEFAULT_FIRST_RESPONSE_SLA_MS;
  return new Date(base + slaMs);
}
