export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

export function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}
