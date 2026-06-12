import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const leadsModelSource = readFileSync(new URL("./leadsPageModel.ts", import.meta.url), "utf8");

test("Dashboard reads the Pipeline conversation deep link from the URL (PL-NAV-1)", () => {
  assert.ok(dashboardSource.includes("readDashboardConversationDeepLink"));
  assert.ok(dashboardSource.includes("pendingDeepLinkConversationIdRef"));
  assert.ok(dashboardSource.includes("readDashboardConversationDeepLink(window.location.search)"));
});

test("Dashboard seeds list selection with the deep-link target before resolution", () => {
  assert.ok(dashboardSource.includes("const deepLinkTargetId = !silent && !append ? pendingDeepLinkConversationIdRef.current : \"\";"));
  assert.ok(dashboardSource.includes("const prevId = deepLinkTargetId || selectedConversationIdRef.current;"));
  assert.ok(dashboardSource.includes("resolveConversationRowsWithDeepLink(pageRows, deepLinkTargetId, tenantId)"));
});

test("Dashboard resolves an off-page deep-link target via the conversation-by-id API", () => {
  assert.ok(dashboardSource.includes("async function fetchConversationRowById"));
  assert.ok(dashboardSource.includes("`/api/conversations/${encodeURIComponent(conversationId)}`"));
  assert.ok(dashboardSource.includes("mergeConversationRowsWithDeepLinkRow"));
});

test("Dashboard fails safe when the deep-link target is missing or inaccessible", () => {
  assert.ok(
    dashboardSource.includes("The conversation from this link was not found or is not accessible.")
  );
});

test("Dashboard cleans the deep-link param with replaceState so Back returns to Pipeline", () => {
  assert.ok(dashboardSource.includes("stripDashboardConversationDeepLink"));
  assert.ok(dashboardSource.includes("window.history.replaceState(window.history.state"));
});

test("Dashboard scrolls the deep-linked inbox row into view after selection", () => {
  assert.ok(dashboardSource.includes("pendingDeepLinkScroll"));
  assert.ok(dashboardSource.includes("data-lead-key={item.leadKey}"));
  assert.ok(dashboardSource.includes("scrollIntoView({ block: \"nearest\" })"));
});

test("Pipeline Open inbox href targets the conversation id, not names or positions", () => {
  assert.ok(leadsModelSource.includes("buildDashboardConversationHref"));
  assert.ok(leadsModelSource.includes("/dashboard?conversationId="));
  assert.equal(leadsModelSource.includes("conversationId=${encodeURIComponent(id)}"), true);
});
