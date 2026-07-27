import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function readChatSection(): string {
  const chatSectionStart = dashboardSource.indexOf('className="dashboard-chat"');
  assert.ok(chatSectionStart >= 0, "dashboard-chat className must exist");
  const sectionTagStart = dashboardSource.lastIndexOf("<section", chatSectionStart);
  assert.ok(sectionTagStart >= 0, "opening <section must exist");
  const chatSectionEnd = dashboardSource.indexOf("</section>", chatSectionStart);
  assert.ok(chatSectionEnd > chatSectionStart, "closing </section> must exist");
  return dashboardSource.slice(sectionTagStart, chatSectionEnd);
}

test("MarketingTimelinePanel is not rendered above chat message body", () => {
  const chatSection = readChatSection();
  assert.equal(chatSection.includes("MarketingTimelinePanel"), false);
  assert.equal(chatSection.includes("dashboard-marketing-timeline-slot"), false);
});

test("right context panel renders with tabs", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-panel"'), true);
  assert.equal(dashboardSource.includes('data-testid={`dashboard-context-tab-${tab}`}'), true);
  assert.equal(dashboardSource.includes("dashboard-context-tab-active"), true);
  assert.equal(dashboardSource.includes("contextPanelOpen"), true);
  assert.equal(dashboardSource.includes("dashboard-root-context-open"), true);
});

test("Marketing Signals tab hosts MarketingTimelinePanel", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-marketing"'), true);
  const marketingTab = dashboardSource.indexOf('data-testid="dashboard-context-marketing"');
  assert.ok(marketingTab >= 0);
  const block = dashboardSource.slice(marketingTab, marketingTab + 1800);
  assert.equal(block.includes("MarketingTimelinePanel"), true);
  assert.equal(block.includes("onRefresh={() => void loadMarketingEvents()}"), true);
  assert.equal(block.includes("loadMarketingEvents({ append: true })"), true);
});

test("Details tab renders conversation metadata from existing Dashboard state", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-details"'), true);
  assert.equal(dashboardSource.includes("resolveConversationParticipantName(selectedConversation)"), true);
  assert.equal(dashboardSource.includes("resolveLeadPlatform(selectedConversation)"), true);
  assert.equal(dashboardSource.includes("selectedConversationStatus"), true);
  assert.equal(dashboardSource.includes("selectedContextInboxBadges"), true);
});

test("Activity tab renders lightweight placeholder using loaded messages", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-activity"'), true);
  assert.match(dashboardSource, /messages\.length/);
  assert.equal(dashboardSource.includes("later phase"), true);
});

test("context panel collapse and expand controls exist", () => {
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-toggle"'), true);
  assert.equal(dashboardSource.includes('data-testid="dashboard-context-collapse"'), true);
  assert.equal(dashboardSource.includes("setContextPanelOpen"), true);
  assert.equal(dashboardSource.includes("contextPanelOpen"), true);
});

test("marketing timeline load does not introduce polling", () => {
  const loadFnStart = dashboardSource.indexOf("async function loadMarketingEvents");
  const nextFn = dashboardSource.indexOf("async function markConversationRead", loadFnStart);
  const block = dashboardSource.slice(loadFnStart, nextFn);
  assert.equal(block.includes("setInterval"), false);
});

test("globals.css defines dashboard context panel grid and tabs", () => {
  assert.match(globalsCss, /\.dashboard-root-context-open\s*\{/);
  assert.match(globalsCss, /\.dashboard-context-panel\s*\{/);
  assert.match(globalsCss, /\.dashboard-context-tab-active\s*\{/);
});

test("compact inbox filters from PR #78 remain in dashboard", () => {
  assert.equal(dashboardSource.includes('data-testid="inbox-filters-drawer-open"'), true);
  assert.equal(dashboardSource.includes('data-testid={`inbox-scope-${key}`}'), true);
  assert.equal(dashboardSource.includes("buildConversationsListQuerySuffix"), true);
});

test("message composer and conversation selection unchanged in chat column", () => {
  const chatSection = readChatSection();
  assert.equal(chatSection.includes('className="chat-composer"'), true);
  assert.equal(chatSection.includes("chat-scroll"), true);
  assert.equal(dashboardSource.includes("void loadMessages(item.latestConversationId"), true);
});
