import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modelSource = readFileSync(new URL("./channelConnectionScopeModel.ts", import.meta.url), "utf8");
const labelSource = readFileSync(new URL("./ChannelConnectionLabel.tsx", import.meta.url), "utf8");
const toggleSource = readFileSync(new URL("./ChannelConnectionScopeToggle.tsx", import.meta.url), "utf8");
const inboxFiltersSource = readFileSync(new URL("./dashboardInboxFilters.ts", import.meta.url), "utf8");
const leadsModelSource = readFileSync(new URL("./leadsPageModel.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("prep model does not classify scope server-side", () => {
  assert.equal(modelSource.includes("classifyLeadSource"), false);
  assert.equal(modelSource.includes("provider_page_id") && modelSource.includes("return"), true);
  assert.match(modelSource, /Must never be rendered/);
});

test("ChannelConnectionLabel does not render provider_page_id", () => {
  assert.equal(labelSource.includes("provider_page_id"), false);
  assert.equal(labelSource.includes("providerPageId"), false);
  assert.equal(labelSource.includes("ChannelConnectionLabel"), true);
});

test("inbox filters prep includes includeDisconnectedConnections", () => {
  assert.equal(inboxFiltersSource.includes("includeDisconnectedConnections"), true);
  assert.equal(inboxFiltersSource.includes("connectionScope"), true);
});

test("leads model prep includes connectionScope filter", () => {
  assert.equal(leadsModelSource.includes("connectionScope"), true);
  assert.equal(leadsModelSource.includes("connectionLabel"), true);
  assert.equal(leadsModelSource.includes("includeDisconnectedConnections"), true);
});

test("Dashboard not wired yet — integration blocked on CCW-1A", () => {
  assert.equal(dashboardSource.includes("ChannelConnectionLabel"), false);
  assert.equal(dashboardSource.includes("ChannelConnectionScopeToggle"), false);
  assert.equal(dashboardSource.includes("includeDisconnectedConnections"), false);
});

test("toggle hidden from sales via canShowIncludeDisconnectedToggle", () => {
  assert.equal(toggleSource.includes("canShowIncludeDisconnectedToggle"), true);
  assert.equal(toggleSource.includes('data-testid="channel-connection-scope-toggle"'), true);
});
