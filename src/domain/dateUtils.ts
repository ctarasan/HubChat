/** Safe ISO string for DB; never throws on invalid Date. */
export function toIsoTimestamp(d: Date | null | undefined): string {
  if (!d) return new Date().toISOString();
  const t = d.getTime();
  return Number.isNaN(t) ? new Date().toISOString() : d.toISOString();
}
