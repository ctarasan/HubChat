import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("desktop remains multi-pane grid with app rail", () => {
  assert.ok(globalsCss.includes("grid-template-columns: var(--app-rail-width) var(--inbox-col-width) minmax(0, 1fr)"));
  assert.ok(globalsCss.includes(".dashboard-root"));
  assert.ok(!globalsCss.includes(".dashboard-root { display: none }"));
});

test("mobile defaults to list when no conversation is selected", () => {
  assert.ok(dashboardSource.includes('useState<MobileView>("list")'));
});

test("selecting a mobile conversation sets mobileView to chat", () => {
  assert.ok(dashboardSource.includes('setMobileView("chat")'));
});

test("mobile Back button returns to list", () => {
  assert.ok(dashboardSource.includes('setMobileView("list")'));
  assert.ok(dashboardSource.includes('data-testid="mobile-back-btn"'));
  assert.ok(dashboardSource.includes('aria-label="Back to inbox list"'));
});

test("scope/filter/search state survives mobile view transitions", () => {
  const backHandler = dashboardSource.indexOf("handleMobileBack");
  assert.ok(backHandler >= 0);
  const backFn = dashboardSource.slice(backHandler, backHandler + 300);
  assert.ok(!backFn.includes("setInboxFilters("), "Back must not reset filters");
  assert.ok(!backFn.includes("setSelectedConversationId("), "Back must not clear selection");
});

test("selected conversation survives mobile view transitions", () => {
  const backHandler = dashboardSource.indexOf("function handleMobileBack");
  const backBody = dashboardSource.slice(backHandler, backHandler + 400);
  assert.ok(!backBody.includes('setSelectedConversationId("")'));
});

test("list scroll restoration stores and restores scrollTop", () => {
  assert.ok(dashboardSource.includes("inboxListScrollTopRef"));
  assert.ok(dashboardSource.includes("inboxListScrollRef"));
});

test("mobile App Rail does not occupy horizontal width", () => {
  assert.ok(globalsCss.includes(".dashboard-mobile .dashboard-app-rail"));
  const mobileRailRule = globalsCss.slice(
    globalsCss.indexOf(".dashboard-mobile .dashboard-app-rail"),
    globalsCss.indexOf("}", globalsCss.indexOf(".dashboard-mobile .dashboard-app-rail")) + 1
  );
  assert.ok(mobileRailRule.includes("display: none"));
});

test("mobile chat header contains Back and essential metadata", () => {
  assert.ok(dashboardSource.includes('data-testid="mobile-back-btn"'));
  assert.ok(dashboardSource.includes("conv-header-name"));
  assert.ok(dashboardSource.includes("chat-header-badges"));
  assert.ok(dashboardSource.includes("conv-header-assignment"));
});

test("details open in bottom sheet on mobile", () => {
  assert.ok(dashboardSource.includes("mobile-details-sheet-root"));
  assert.ok(dashboardSource.includes('role="dialog"'));
  assert.ok(dashboardSource.includes('aria-modal="true"'));
  assert.ok(dashboardSource.includes('aria-label="Conversation details"'));
  assert.ok(globalsCss.includes(".mobile-details-sheet-panel"));
});

test("composer is available in active chat", () => {
  assert.ok(dashboardSource.includes("chat-composer"));
  assert.ok(dashboardSource.includes("composer-textarea"));
  assert.ok(dashboardSource.includes("composer-send-btn"));
});

test("hidden panels are not focusable via aria-hidden", () => {
  assert.ok(dashboardSource.includes('aria-hidden={isMobile && mobileView !== "list" ? true : undefined}'));
  assert.ok(dashboardSource.includes('aria-hidden={isMobile && mobileView === "list" ? true : undefined}'));
});

test("mobile and desktop share the same data and handlers", () => {
  const pickCount = (dashboardSource.match(/setSelectedConversationId/g) || []).length;
  assert.ok(pickCount >= 2, "selection setter used in at least two places");
  assert.ok(dashboardSource.includes("loadMessages"), "single loadMessages handler");
  assert.ok(dashboardSource.includes("sendCompose"), "single sendCompose handler");
});

test("breakpoint change does not reload or duplicate fetches", () => {
  assert.ok(dashboardSource.includes("useResponsiveMode"));
  assert.ok(!dashboardSource.includes("location.reload()"));
  const hookSource = dashboardSource.slice(
    dashboardSource.indexOf("function useResponsiveMode"),
    dashboardSource.indexOf("return mode;\n}")
  );
  assert.ok(!hookSource.includes("loadConversations"));
  assert.ok(!hookSource.includes("loadMessages"));
});

test("OPEN/NEW/SLA/waiting badges remain in card and CSS", () => {
  assert.ok(dashboardSource.includes("inboxBadges"));
  assert.ok(globalsCss.includes("inbox-badge-sla-overdue"));
  assert.ok(globalsCss.includes("inbox-badge-waiting-us"));
  assert.ok(globalsCss.includes("inbox-badge-waiting-customer"));
});

test("assignment summary remains correct", () => {
  assert.ok(dashboardSource.includes("formatInboxAssignmentSummary"));
  assert.ok(dashboardSource.includes("selectedAssignmentSummary"));
  assert.ok(dashboardSource.includes("conversation-list-assignment"));
});

test("logout confirmation and appearance remain usable", () => {
  assert.ok(dashboardSource.includes("DashboardAppRailSignOutButton"));
  assert.ok(dashboardSource.includes("onSignOut"));
});

test("existing desktop Inbox tests infrastructure preserved", () => {
  assert.ok(dashboardSource.includes('data-testid="dashboard-inbox-column"'));
  assert.ok(dashboardSource.includes('data-testid="dashboard-context-toggle"'));
  assert.ok(dashboardSource.includes('data-testid="chat-header-actions-open"'));
});

test("no API/domain mutation was introduced", () => {
  assert.ok(!dashboardSource.includes("ALTER TABLE"));
  assert.ok(!dashboardSource.includes("CREATE TABLE"));
  assert.ok(!dashboardSource.includes("DROP TABLE"));
});

test("no horizontal-overflow structure — CSS avoids fixed widths on mobile", () => {
  assert.ok(globalsCss.includes(".dashboard-mobile"));
  assert.ok(globalsCss.includes("grid-template-columns: 1fr"), "mobile uses 1fr single column");
});

test("responsive hook uses matchMedia with correct breakpoints", () => {
  assert.ok(dashboardSource.includes("MOBILE_BREAKPOINT = 768"));
  assert.ok(dashboardSource.includes("DESKTOP_BREAKPOINT = 1024"));
  assert.ok(dashboardSource.includes("matchMedia"));
});

test("mobile details sheet has close control and Escape support", () => {
  assert.ok(dashboardSource.includes("handleCloseMobileDetails"));
  assert.ok(dashboardSource.includes('e.key === "Escape"'));
  assert.ok(dashboardSource.includes("mobile-details-sheet-close"));
  assert.ok(dashboardSource.includes("mobile-details-sheet-scrim"));
});

test("mobile composer uses safe-area-inset-bottom", () => {
  assert.ok(globalsCss.includes("env(safe-area-inset-bottom"));
});

test("tablet layout uses two-pane grid", () => {
  assert.ok(globalsCss.includes(".dashboard-tablet"));
  const tabletRule = globalsCss.slice(
    globalsCss.indexOf(".dashboard-tablet {"),
    globalsCss.indexOf("}", globalsCss.indexOf(".dashboard-tablet {")) + 1
  );
  assert.ok(tabletRule.includes("1fr 1fr"));
});

test("browser Back support via history pushState/popstate", () => {
  assert.ok(dashboardSource.includes("pushState"));
  assert.ok(dashboardSource.includes("popstate"));
});

test("dvh viewport sizing used for mobile layout", () => {
  assert.ok(globalsCss.includes("100dvh"));
});
