/** Safe ISO string for DB; never throws on invalid Date. */
export function toIsoTimestamp(d: Date | null | undefined): string {
  if (!d) return new Date().toISOString();
  const t = d.getTime();
  return Number.isNaN(t) ? new Date().toISOString() : d.toISOString();
}

function coerceNumericEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericEpochToIso(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const epochMs = value < 10_000_000_000 ? value * 1000 : value;
  const parsed = new Date(epochMs);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseMetaTimestamp(value: unknown): string {
  const numeric = coerceNumericEpoch(value);
  if (numeric !== null) {
    const fromNumeric = numericEpochToIso(numeric);
    if (fromNumeric) return fromNumeric;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}
