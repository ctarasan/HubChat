import type { ListResponseCostReport, PayloadCostTier } from "../domain/observability.js";

const DEFAULT_TIER_BYTES = {
  medium: 50_000,
  high: 200_000,
  veryHigh: 500_000
} as const;

/**
 * Rough UTF-8 byte estimate for JSON serialization (cost governance; not wire-accurate).
 */
export function estimateUtf8JsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export function classifyPayloadCostTier(
  estimatedUtf8Bytes: number,
  limits: { medium: number; high: number; veryHigh: number } = DEFAULT_TIER_BYTES
): PayloadCostTier {
  if (estimatedUtf8Bytes >= limits.veryHigh) return "very_high";
  if (estimatedUtf8Bytes >= limits.high) return "high";
  if (estimatedUtf8Bytes >= limits.medium) return "medium";
  return "low";
}

export function buildListResponseCostReport(opts: {
  route: string;
  itemCount: number;
  limit: number;
  hasCursor: boolean;
  responseBody: unknown;
}): ListResponseCostReport {
  const estimatedUtf8Bytes = estimateUtf8JsonBytes(opts.responseBody);
  return {
    route: opts.route,
    itemCount: opts.itemCount,
    limit: opts.limit,
    hasCursor: opts.hasCursor,
    estimatedUtf8Bytes,
    tier: classifyPayloadCostTier(estimatedUtf8Bytes)
  };
}
