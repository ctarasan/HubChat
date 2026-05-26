import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMarketingTimelineFixturesAreSafe,
  filterMarketingTimelineByGroups,
  formatMarketingTimelineDateLabel,
  formatMarketingTimelineTime,
  groupMarketingTimelineItemsByDate,
  MOCK_MARKETING_TIMELINE_DEMO_ITEMS,
  parseMarketingTimelineOccurredAt,
  sortMarketingTimelineItemsDesc,
  timelineItemHasForbiddenPayloadFields,
  type MarketingTimelineItemViewModel
} from "./marketingTimelineModel.js";

const CLOCK = new Date("2026-05-20T12:00:00.000Z");

test("demo fixtures are safe and omit message body or media URLs", () => {
  assert.equal(assertMarketingTimelineFixturesAreSafe(MOCK_MARKETING_TIMELINE_DEMO_ITEMS), true);
  for (const item of MOCK_MARKETING_TIMELINE_DEMO_ITEMS) {
    const json = JSON.stringify(item);
    assert.equal(json.includes("http://"), false);
    assert.equal(json.includes("https://"), false);
    assert.equal(json.toLowerCase().includes("messagebody"), false);
  }
  const withDescription = MOCK_MARKETING_TIMELINE_DEMO_ITEMS.filter((i) => i.description);
  assert.ok(withDescription.length >= 2);
  assert.ok(withDescription.some((i) => /preview omitted|form submission|recorded/i.test(i.description ?? "")));
});

test("timelineItemHasForbiddenPayloadFields detects sensitive keys", () => {
  const safe: MarketingTimelineItemViewModel = {
    id: "x",
    group: "system",
    title: "T",
    occurredAt: "2026-05-20T10:00:00.000Z",
    actorLabel: "System",
    channelLabel: "HubChat"
  };
  assert.equal(timelineItemHasForbiddenPayloadFields(safe), false);
  assert.equal(
    timelineItemHasForbiddenPayloadFields({ ...safe, messageBody: "secret" } as MarketingTimelineItemViewModel),
    true
  );
});

test("sortMarketingTimelineItemsDesc orders newest first", () => {
  const sorted = sortMarketingTimelineItemsDesc(MOCK_MARKETING_TIMELINE_DEMO_ITEMS);
  assert.equal(sorted[0]?.id, "mt-demo-3");
  assert.ok(
    (parseMarketingTimelineOccurredAt(sorted[0]!.occurredAt)?.getTime() ?? 0) >=
      (parseMarketingTimelineOccurredAt(sorted[1]!.occurredAt)?.getTime() ?? 0)
  );
});

test("groupMarketingTimelineItemsByDate groups by local day labels", () => {
  const groups = groupMarketingTimelineItemsByDate(MOCK_MARKETING_TIMELINE_DEMO_ITEMS, CLOCK);
  assert.ok(groups.length >= 2);
  assert.equal(groups[0]?.dateLabel, "Today");
  assert.ok(groups.some((g) => g.dateLabel === "Yesterday" || g.dateLabel.includes("May")));
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  assert.equal(total, MOCK_MARKETING_TIMELINE_DEMO_ITEMS.length);
});

test("filterMarketingTimelineByGroups returns all when none selected", () => {
  assert.equal(filterMarketingTimelineByGroups(MOCK_MARKETING_TIMELINE_DEMO_ITEMS, new Set()).length, 6);
});

test("filterMarketingTimelineByGroups filters selected groups", () => {
  const filtered = filterMarketingTimelineByGroups(
    MOCK_MARKETING_TIMELINE_DEMO_ITEMS,
    new Set(["sla", "system"])
  );
  assert.equal(filtered.length, 2);
  assert.equal(filtered.every((i) => i.group === "sla" || i.group === "system"), true);
});

test("formatMarketingTimelineTime and date label helpers", () => {
  assert.match(formatMarketingTimelineTime("2026-05-20T09:12:00.000Z"), /\d/);
  assert.equal(formatMarketingTimelineDateLabel("2026-05-20T09:12:00.000Z", CLOCK), "Today");
  assert.equal(formatMarketingTimelineDateLabel("2026-05-19T09:12:00.000Z", CLOCK), "Yesterday");
});
