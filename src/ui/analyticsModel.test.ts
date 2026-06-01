import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_RANGE_OPTIONS,
  MANAGEMENT_ROLLUP_LABELS,
  barWidthPercent,
  buildAnalyticsOverviewPath,
  formatAnalyticsCount,
  formatBreachRatePercent,
  formatSummaryCardValue,
  isAnalyticsOverviewSparse,
  managementRollupRows,
  parseAnalyticsOverviewGetResponse,
  safeCount
} from "./analyticsModel.js";
import type { AnalyticsOverviewDto } from "../domain/analyticsOverview.js";

test("buildAnalyticsOverviewPath encodes range query", () => {
  assert.equal(buildAnalyticsOverviewPath("7d"), "/api/analytics/overview?range=7d");
  assert.equal(buildAnalyticsOverviewPath("today"), "/api/analytics/overview?range=today");
});

test("formatBreachRatePercent multiplies ratio by 100 with two decimals", () => {
  assert.equal(formatBreachRatePercent(0.1234), "12.34%");
  assert.equal(formatBreachRatePercent(0.25), "25.00%");
  assert.equal(formatBreachRatePercent(null), "0.00%");
});

test("safeCount and formatAnalyticsCount handle nullish values", () => {
  assert.equal(safeCount(null), 0);
  assert.equal(safeCount(-3), 0);
  assert.equal(formatAnalyticsCount(undefined), "0");
});

test("parseAnalyticsOverviewGetResponse rejects invalid body", () => {
  assert.equal(parseAnalyticsOverviewGetResponse(null).ok, false);
  assert.equal(parseAnalyticsOverviewGetResponse({ data: {} }).ok, false);
});

test("MANAGEMENT_ROLLUP_LABELS clarify FOLLOW_UP and CLOSED semantics", () => {
  assert.match(MANAGEMENT_ROLLUP_LABELS.FOLLOW_UP, /Follow-up scheduled/i);
  assert.match(MANAGEMENT_ROLLUP_LABELS.CLOSED, /Unqualified/i);
  assert.doesNotMatch(MANAGEMENT_ROLLUP_LABELS.CLOSED, /resolved/i);
});

test("managementRollupRows exposes labeled counts", () => {
  const rows = managementRollupRows({
    NEW: 1,
    IN_PROGRESS: 2,
    FOLLOW_UP: 3,
    WON: 0,
    LOST: 0,
    CLOSED: 4
  });
  assert.equal(rows.find((r) => r.key === "FOLLOW_UP")?.label, MANAGEMENT_ROLLUP_LABELS.FOLLOW_UP);
  assert.equal(rows.find((r) => r.key === "CLOSED")?.count, 4);
});

test("isAnalyticsOverviewSparse true for empty tenant shape", () => {
  const dto = {
    conversations: { snapshot: { total: 0 } },
    channelBreakdown: { period: { inboundMessages: { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0 } } },
    teamWorkload: []
  } as unknown as AnalyticsOverviewDto;
  assert.equal(isAnalyticsOverviewSparse(dto), true);
});

test("barWidthPercent caps at 100", () => {
  assert.equal(barWidthPercent(5, 10), 50);
  assert.equal(barWidthPercent(10, 0), 100);
});

test("ANALYTICS_RANGE_OPTIONS includes today 7d 30d", () => {
  assert.deepEqual(
    ANALYTICS_RANGE_OPTIONS.map((o) => o.value),
    ["today", "7d", "30d"]
  );
});

test("formatSummaryCardValue formats count cards", () => {
  assert.equal(formatSummaryCardValue({ id: "x", label: "L", value: 12, unit: "count" }), "12");
});
