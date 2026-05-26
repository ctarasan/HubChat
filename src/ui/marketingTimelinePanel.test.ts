import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(new URL("./MarketingTimelinePanel.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./marketingTimelineModel.ts", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("MarketingTimelinePanel is read-only shell without API fetch or polling", () => {
  assert.equal(panelSource.includes("fetch("), false);
  assert.equal(panelSource.includes("/api/marketing-events"), false);
  assert.equal(panelSource.includes("setInterval"), false);
  assert.equal(panelSource.includes("WebSocket"), false);
  assert.equal(panelSource.includes("useEffect"), false);
  assert.equal(panelSource.includes("campaign"), false);
  assert.equal(panelSource.includes("automation"), false);
  assert.equal(panelSource.includes("broadcast"), false);
});

test("MarketingTimelinePanel exposes loading, empty, error, and ready test ids", () => {
  assert.equal(panelSource.includes('data-testid="marketing-timeline-panel"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-loading"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-empty"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-error"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-ready"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-list"'), true);
  assert.equal(panelSource.includes('data-testid="marketing-timeline-idle"'), true);
});

test("MarketingTimelinePanel renders grouped dates and compact row metadata", () => {
  assert.equal(panelSource.includes("groupMarketingTimelineItemsByDate"), true);
  assert.equal(panelSource.includes("marketing-timeline-date-label"), true);
  assert.equal(panelSource.includes("marketing-timeline-row-meta"), true);
  assert.equal(panelSource.includes("marketing-timeline-meta-summary"), true);
  assert.equal(panelSource.includes("marketing-timeline-marker"), true);
});

test("MarketingTimelinePanel supports local group filter chips", () => {
  assert.equal(panelSource.includes("marketing-timeline-filter-bar"), true);
  assert.equal(panelSource.includes("marketing-timeline-filter-chip"), true);
  assert.equal(panelSource.includes("filterMarketingTimelineByGroups"), true);
  assert.equal(panelSource.includes('data-testid={`marketing-timeline-filter-${group}`}'), true);
});

test("model uses UI-local MarketingTimelineItemViewModel not backend DTO names", () => {
  assert.equal(modelSource.includes("MarketingTimelineItemViewModel"), true);
  assert.equal(modelSource.includes("marketing-events"), false);
  assert.equal(modelSource.includes("MarketingEventDto"), false);
  assert.equal(modelSource.includes("FORBIDDEN_METADATA_KEYS"), true);
  assert.equal(modelSource.includes('messageBody: "'), false);
  assert.equal(modelSource.includes('mediaUrl: "'), false);
  assert.equal(modelSource.includes("MOCK_MARKETING_TIMELINE_DEMO_ITEMS"), true);
});

test("DashboardPage is not integrated in M1-B1", () => {
  assert.equal(dashboardSource.includes("MarketingTimelinePanel"), false);
  assert.equal(dashboardSource.includes("marketing-timeline-panel"), false);
});

test("globals.css defines scoped marketing timeline panel styles", () => {
  assert.match(globalsCss, /\.marketing-timeline-panel\s*\{/);
  assert.match(globalsCss, /\.marketing-timeline-row\s*\{/);
  assert.match(globalsCss, /@media \(max-width: 720px\)[\s\S]*\.marketing-timeline-panel/);
});
