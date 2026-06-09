import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modelSource = readFileSync(new URL("./channelConnectionScopeModel.ts", import.meta.url), "utf8");
const labelSource = readFileSync(new URL("./ChannelConnectionLabel.tsx", import.meta.url), "utf8");
const toggleSource = readFileSync(new URL("./ChannelConnectionScopeToggle.tsx", import.meta.url), "utf8");
const inboxFiltersSource = readFileSync(new URL("./dashboardInboxFilters.ts", import.meta.url), "utf8");
const leadsModelSource = readFileSync(new URL("./leadsPageModel.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const leadsPageSource = readFileSync(new URL("./LeadsPage.tsx", import.meta.url), "utf8");
const workQueuePageSource = readFileSync(new URL("./WorkQueuePage.tsx", import.meta.url), "utf8");
const analyticsPageSource = readFileSync(new URL("./AnalyticsPage.tsx", import.meta.url), "utf8");

test("model does not classify scope server-side", () => {
  assert.equal(modelSource.includes("classifyLeadSource"), false);
  assert.equal(modelSource.includes("provider_page_id") && modelSource.includes("return"), true);
  assert.match(modelSource, /Must never be rendered/);
  assert.equal(modelSource.includes("connection_scope_bucket"), true);
  assert.equal(modelSource.includes("connectionScopeBucket"), true);
});

test("ChannelConnectionLabel does not render provider_page_id", () => {
  assert.equal(labelSource.includes("provider_page_id"), false);
  assert.equal(labelSource.includes("providerPageId"), false);
  assert.equal(labelSource.includes("ChannelConnectionLabel"), true);
});

test("inbox filters include connectionScope query suffix", () => {
  assert.equal(inboxFiltersSource.includes("includeDisconnectedConnections"), true);
  assert.equal(inboxFiltersSource.includes("connectionScope"), true);
});

test("leads model includes connectionScope filter and bucket fields", () => {
  assert.equal(leadsModelSource.includes("connectionScope"), true);
  assert.equal(leadsModelSource.includes("connectionLabel"), true);
  assert.equal(leadsModelSource.includes("connectionScopeBucket"), true);
  assert.equal(leadsModelSource.includes("includeDisconnectedConnections"), true);
});

test("Dashboard wired with connection label and scope toggle", () => {
  assert.equal(dashboardSource.includes("ChannelConnectionLabel"), true);
  assert.equal(dashboardSource.includes("ChannelConnectionScopeToggle"), true);
  assert.equal(dashboardSource.includes("includeDisconnectedConnections"), true);
  assert.equal(dashboardSource.includes("chat-header-connection"), true);
  assert.equal(dashboardSource.includes("dashboard-context-connection"), true);
});

test("Leads page wired with connection column and scope toggle", () => {
  assert.equal(leadsPageSource.includes("ChannelConnectionLabel"), true);
  assert.equal(leadsPageSource.includes("ChannelConnectionScopeToggle"), true);
  assert.equal(leadsPageSource.includes("buildLeadsListUrl(appliedFilters"), true);
  assert.equal(leadsPageSource.includes("role: meContext.role"), true);
});

test("Work queue passes connectionScope to API path builder", () => {
  assert.equal(workQueuePageSource.includes("connectionScope"), true);
  assert.equal(workQueuePageSource.includes("ChannelConnectionScopeToggle"), true);
});

test("Analytics shows scope-not-applied banner only", () => {
  assert.equal(analyticsPageSource.includes("resolveAnalyticsConnectionScopeBanner"), true);
  assert.equal(analyticsPageSource.includes("ChannelConnectionScopeToggle"), false);
});

test("toggle hidden from sales via canShowIncludeDisconnectedToggle", () => {
  assert.equal(toggleSource.includes("canShowIncludeDisconnectedToggle"), true);
  assert.equal(toggleSource.includes('data-testid="channel-connection-scope-toggle"'), true);
});
