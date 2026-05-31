import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAnalyticsOverviewQuery,
  resolveAnalyticsPeriod
} from "./analyticsOverviewContracts.js";

test("parseAnalyticsOverviewQuery defaults range to 7d", () => {
  const r = parseAnalyticsOverviewQuery({});
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.range, "7d");
});

test("parseAnalyticsOverviewQuery accepts today 7d 30d", () => {
  for (const range of ["today", "7d", "30d"] as const) {
    const r = parseAnalyticsOverviewQuery({ range });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.range, range);
  }
});

test("parseAnalyticsOverviewQuery rejects invalid range", () => {
  const r = parseAnalyticsOverviewQuery({ range: "90d" });
  assert.equal(r.ok, false);
});

test("resolveAnalyticsPeriod today uses UTC day start", () => {
  const now = new Date("2026-06-01T15:30:00.000Z");
  const p = resolveAnalyticsPeriod("today", now);
  assert.equal(p.startAt, "2026-06-01T00:00:00.000Z");
  assert.equal(p.endAt, now.toISOString());
});

test("resolveAnalyticsPeriod 7d spans seven days", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");
  const p = resolveAnalyticsPeriod("7d", now);
  assert.equal(p.endAt, now.toISOString());
  assert.equal(p.startAt, "2026-06-01T12:00:00.000Z");
});
