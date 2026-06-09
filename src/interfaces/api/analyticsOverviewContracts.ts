import { z } from "zod";
import type { AnalyticsRange } from "../../domain/analyticsOverview.js";
import { CONNECTION_SCOPE_VALUES } from "./connectionScopeQuery.js";
import type { ConnectionScopeMode } from "../../domain/channelConnectionScope.js";

export const ANALYTICS_RANGE_VALUES = ["today", "7d", "30d"] as const;

export const AnalyticsOverviewQuerySchema = z.object({
  range: z.enum(ANALYTICS_RANGE_VALUES).optional(),
  connectionScope: z.enum(CONNECTION_SCOPE_VALUES).optional()
});

export type AnalyticsOverviewQuery = z.infer<typeof AnalyticsOverviewQuerySchema>;

export type ParseAnalyticsOverviewQueryResult =
  | { ok: true; range: AnalyticsRange; connectionScope?: ConnectionScopeMode }
  | { ok: false; message: string };

export function parseAnalyticsOverviewQuery(
  qs: Record<string, string | undefined>
): ParseAnalyticsOverviewQueryResult {
  const parsed = AnalyticsOverviewQuerySchema.safeParse({
    range: qs.range?.trim() || undefined,
    connectionScope: qs.connectionScope?.trim() || undefined
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message };
  }
  const range = parsed.data.range ?? "7d";
  return { ok: true, range, connectionScope: parsed.data.connectionScope };
}

export function resolveAnalyticsPeriod(
  range: AnalyticsRange,
  now: Date = new Date()
): { startAt: string; endAt: string } {
  const endAt = now.toISOString();
  if (range === "today") {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { startAt: dayStart.toISOString(), endAt };
  }
  const days = range === "7d" ? 7 : 30;
  const startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { startAt, endAt };
}
