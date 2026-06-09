/** Mask provider account/page IDs for operator-safe display (prefix + length only). */
export function maskProviderIdentity(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const prefix = trimmed.slice(0, Math.min(4, trimmed.length));
  return `${prefix}…len=${trimmed.length}`;
}

/** True when a label value looks like a raw numeric provider id rather than a human name. */
export function isLikelyRawProviderId(value: string | null | undefined): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return false;
  return /^\d{8,}$/.test(trimmed);
}
