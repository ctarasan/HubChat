/** Pure date math: compute deadline from customer message instant + SLA window (ms). */
export function computeSlaDueAtFromCustomerMessage(
  customerMessageAt: Date,
  options: { slaMs: number }
): Date | null {
  const base = customerMessageAt.getTime();
  if (Number.isNaN(base)) return null;
  if (!Number.isFinite(options.slaMs) || options.slaMs <= 0) return null;
  return new Date(base + options.slaMs);
}
