import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./MarketingTimelinePanel.tsx", import.meta.url), "utf8");

test("dashboard integrates MarketingTimelinePanel with marketing-events API", () => {
  assert.equal(dashboardSource.includes("MarketingTimelinePanel"), true);
  assert.equal(dashboardSource.includes('data-testid="dashboard-marketing-timeline-slot"'), true);
  assert.equal(dashboardSource.includes("fetchMarketingEventsList"), true);
  assert.equal(dashboardSource.includes('"/api/marketing-events"'), false);
  assert.equal(dashboardSource.includes("mapMarketingEventToTimelineItem"), true);
  assert.equal(dashboardSource.includes("buildMarketingEventsListPath"), false);
  assert.equal(dashboardSource.includes("readConversationLeadId"), true);
});

test("dashboard loads marketing events when selected conversation changes", () => {
  assert.equal(dashboardSource.includes("async function loadMarketingEvents"), true);
  assert.equal(dashboardSource.includes("marketingTimelineLoadSeqRef"), true);
  const effectStart = dashboardSource.indexOf("void loadMarketingEvents();");
  assert.ok(effectStart >= 0);
  assert.ok(dashboardSource.lastIndexOf("selectedConversationId", effectStart) < effectStart);
  assert.ok(dashboardSource.includes("conversationId = selectedConversationId.trim()"));
});

test("dashboard clears marketing timeline when no active conversation", () => {
  assert.match(
    dashboardSource,
    /if \(!conversationId\) \{[\s\S]*setMarketingTimelineStatus\("idle"\)/
  );
  assert.match(dashboardSource, /fetchMarketingEventsList\(\{[\s\S]*conversationId/);
});

test("dashboard does not poll marketing events", () => {
  const loadFnStart = dashboardSource.indexOf("async function loadMarketingEvents");
  const nextFn = dashboardSource.indexOf("async function markConversationRead", loadFnStart);
  assert.ok(loadFnStart >= 0 && nextFn > loadFnStart);
  const block = dashboardSource.slice(loadFnStart, nextFn);
  assert.equal(block.includes("setInterval"), false);
  assert.equal(block.includes("DashboardConversationPollScheduler"), false);
});

test("dashboard supports manual refresh and cursor load more", () => {
  assert.equal(dashboardSource.includes("onRefresh={() => void loadMarketingEvents()}"), true);
  assert.equal(dashboardSource.includes("loadMarketingEvents({ append: true })"), true);
  assert.equal(dashboardSource.includes("marketingTimelineNextCursor"), true);
  assert.equal(dashboardSource.includes("MARKETING_EVENTS_DEFAULT_LIMIT"), true);
});

test("marketing timeline panel remains presentational without fetch", () => {
  assert.equal(panelSource.includes("fetch("), false);
  assert.equal(panelSource.includes("setInterval"), false);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-refresh"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-load-more"'), true);
});
