/**
 * INBOX-MOBILE-1 remediation — local fixture Playwright E2E.
 *
 * Uses a dummy local session + intercepted /api/* fixtures.
 * Never hits Production Supabase or sends real messages.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SESSION_KEY = "hubchat.session.config.v1";
const APPEARANCE_KEY = "hubchat.appearance";
const FIXTURE_TENANT = "fixture-tenant-inbox-mobile-1";
const FIXTURE_TOKEN = "fixture-access-token-not-real";
const CONV_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_DIR = resolve(
  process.cwd(),
  "docs/agent-reports/agent-a/inbox-mobile-1-remediation"
);

const FIXTURE_ME = {
  data: {
    tenantId: FIXTURE_TENANT,
    userId: "user-fixture-1",
    email: "fixture.agent@example.com",
    role: "MANAGER",
    salesAgentId: "agent-fixture-1"
  }
};

const FIXTURE_CONVERSATION = {
  id: CONV_ID,
  tenant_id: FIXTURE_TENANT,
  participant_display_name: "Fixture Customer",
  channel_type: "FACEBOOK",
  provider_thread_type: "MESSENGER_DM",
  conversation_status: "OPEN",
  assignment_status: "ASSIGNED",
  priority: "NORMAL",
  assigned_sales_agent_id: "agent-fixture-1",
  assigned_sales_agent_name: "Sale One",
  last_message_at: "2026-07-27T08:00:00.000Z",
  last_message_preview: "สวัสดีครับ ต้องการสอบถามราคา",
  unread_count: 1,
  lead_management_status: "NEW",
  sla_due_at: "2026-07-26T08:00:00.000Z",
  last_customer_message_at: "2026-07-27T08:00:00.000Z",
  last_agent_message_at: null
};

const FIXTURE_MESSAGES = {
  data: [
    {
      id: "msg-1",
      conversation_id: CONV_ID,
      direction: "INBOUND",
      body_text: "สวัสดีครับ ต้องการสอบถามราคา",
      created_at: "2026-07-27T07:59:00.000Z",
      message_type: "TEXT"
    },
    {
      id: "msg-2",
      conversation_id: CONV_ID,
      direction: "OUTBOUND",
      body_text: "ยินดีต้อนรับครับ",
      created_at: "2026-07-27T08:00:00.000Z",
      message_type: "TEXT"
    }
  ],
  pageInfo: { nextCursor: null }
};

type ApiCounters = {
  conversations: number;
  messages: number;
  me: number;
};

async function installFixtureRoutes(page: Page, counters: ApiCounters): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/me" && method === "GET") {
      counters.me += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE_ME) });
      return;
    }
    if (path === "/api/sales-agents" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "agent-fixture-1", email: "sale.one@example.com", name: "Sale One", role: "SALES", status: "ACTIVE" }]
        })
      });
      return;
    }
    if (path === "/api/conversations" && method === "GET") {
      counters.conversations += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [FIXTURE_CONVERSATION], pageInfo: { nextCursor: null } })
      });
      return;
    }
    if (path === `/api/conversations/${CONV_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: FIXTURE_CONVERSATION })
      });
      return;
    }
    if (path === `/api/conversations/${CONV_ID}/messages` && method === "GET") {
      counters.messages += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE_MESSAGES)
      });
      return;
    }
    if (path === `/api/conversations/${CONV_ID}/mark-read` && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
      return;
    }
    if (path.startsWith("/api/message-templates")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], pageInfo: { nextCursor: null } })
      });
      return;
    }
    // Block unexpected mutations / unknown APIs with safe empty success.
    if (method !== "GET" && method !== "HEAD") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });
}

async function seedFixtureSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ sessionKey, appearanceKey, tenantId, token }) => {
      try {
        localStorage.setItem(
          sessionKey,
          JSON.stringify({
            baseUrl: window.location.origin,
            tenantId,
            accessToken: token
          })
        );
        localStorage.removeItem(appearanceKey);
      } catch {
        // ignore
      }
    },
    { sessionKey: SESSION_KEY, appearanceKey: APPEARANCE_KEY, tenantId: FIXTURE_TENANT, token: FIXTURE_TOKEN }
  );
}

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function openFirstConversation(page: Page): Promise<void> {
  const hit = page.locator("button.conversation-list-main-hit").first();
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.click();
  await expect(page.locator("section.dashboard-chat")).toBeVisible();
}

async function chooseAppearanceFromOverflow(page: Page, value: "system" | "light" | "dark"): Promise<void> {
  const panel = page.getByTestId("mobile-inbox-overflow-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId("mobile-inbox-overflow-trigger").click();
  }
  await expect(panel).toBeVisible();
  await panel.getByTestId("appearance-menu-trigger").click();
  await expect(page.getByTestId("appearance-menu-list")).toBeVisible();
  await page.getByTestId(`appearance-option-${value}`).click();
  await expect(page.getByTestId("appearance-menu-list")).toHaveCount(0);
}

async function closeOverflowIfOpen(page: Page): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const panelVisible = await page.getByTestId("mobile-inbox-overflow-panel").isVisible().catch(() => false);
    const listVisible = await page.getByTestId("appearance-menu-list").isVisible().catch(() => false);
    if (!panelVisible && !listVisible) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("mobile-inbox-overflow-panel")).toHaveCount(0);
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: resolve(EVIDENCE_DIR, name), fullPage: false });
}

test.describe("INBOX-MOBILE-1 fixture responsive E2E", () => {
  test.describe.configure({ mode: "serial" });

  test("mobile/tablet/desktop fixture matrix with appearance and details a11y", async ({ page }) => {
    const counters: ApiCounters = { conversations: 0, messages: 0, me: 0 };
    await seedFixtureSession(page);
    await installFixtureRoutes(page, counters);

    // ── 320 Mobile list Light ──
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/dashboard");
    await expect(page.getByTestId("mobile-inbox-header")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
    await expect(page.getByTestId("mobile-inbox-overflow-trigger")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toHaveClass(/dashboard-mobile-list|dashboard-mobile/);
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "320-mobile-list-light.png");

    // Appearance on mobile
    await page.getByTestId("mobile-inbox-overflow-trigger").click();
    await expect(page.getByTestId("mobile-inbox-overflow-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-inbox-overflow-panel").getByTestId("appearance-menu-trigger")).toBeVisible();
    await page.getByTestId("mobile-inbox-overflow-panel").getByTestId("appearance-menu-trigger").click();
    await expect(page.getByTestId("appearance-menu-list")).toBeVisible();
    await expect(page.getByTestId("appearance-option-system")).toBeVisible();
    await expect(page.getByTestId("appearance-option-light")).toBeVisible();
    await expect(page.getByTestId("appearance-option-dark")).toBeVisible();
    await shot(page, "mobile-appearance-menu.png");
    await page.getByTestId("appearance-option-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Sign out confirmation reachable (overflow remains open after appearance choose)
    if (!(await page.getByTestId("mobile-inbox-overflow-panel").isVisible().catch(() => false))) {
      await page.getByTestId("mobile-inbox-overflow-trigger").click();
    }
    await expect(page.getByTestId("mobile-inbox-overflow-panel")).toBeVisible();
    await page.getByTestId("mobile-overflow-sign-out").click();
    await expect(page.getByTestId("logout-confirm-dialog")).toBeVisible();
    await page.getByTestId("logout-confirm-cancel").click();
    await expect(page.getByTestId("logout-confirm-dialog")).toHaveCount(0);
    await closeOverflowIfOpen(page);

    // ── 375 Mobile list Dark ──
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByTestId("mobile-inbox-header")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "375-mobile-list-dark.png");

    // Switch back to light for chat shots
    await chooseAppearanceFromOverflow(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await closeOverflowIfOpen(page);

    const convCountBeforeChat = counters.conversations;
    const msgCountBeforeChat = counters.messages;

    // list → chat → Back
    await openFirstConversation(page);
    await expect(page.getByTestId("mobile-back-btn")).toBeVisible();
    await expect(page.locator("footer.chat-composer")).toBeVisible();
    await expect(page.getByLabel("Message text")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "mobile-chat-light.png");

    // Draft preservation across details open/close
    await page.getByLabel("Message text").fill("draft ข้อความทดสอบ");
    await page.getByTestId("mobile-details-btn").click();
    await expect(page.getByTestId("mobile-details-sheet-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-details-sheet-close")).toBeFocused();
    await expect(page.getByTestId("mobile-details-sheet-title")).toBeVisible();
    await expect(page.getByTestId("mobile-details-sheet-panel")).toHaveAttribute("aria-labelledby", /.+/);
    await shot(page, "mobile-details-sheet-focused-close.png");

    // Focus trap: Tab from close should stay in sheet
    await page.keyboard.press("Tab");
    const activeInSheet = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="mobile-details-sheet-panel"]');
      return Boolean(panel && panel.contains(document.activeElement));
    });
    expect(activeInSheet).toBe(true);

    // Underlying composer must not be focusable while sheet open (inert)
    const mainInert = await page.evaluate(() => document.querySelector("main.dashboard-root")?.hasAttribute("inert") ?? false);
    expect(mainInert).toBe(true);

    // Inside click does not close
    await page.getByTestId("mobile-details-sheet-title").click();
    await expect(page.getByTestId("mobile-details-sheet-panel")).toBeVisible();

    // Escape closes + focus returns
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mobile-details-sheet-panel")).toHaveCount(0);
    await expect(page.getByTestId("mobile-details-btn")).toBeFocused();
    await expect(page.getByLabel("Message text")).toHaveValue("draft ข้อความทดสอบ");

    // Reopen + backdrop close
    await page.getByTestId("mobile-details-btn").click();
    await expect(page.getByTestId("mobile-details-sheet-close")).toBeFocused();
    await page.getByTestId("mobile-details-sheet-scrim").click();
    await expect(page.getByTestId("mobile-details-sheet-panel")).toHaveCount(0);
    await expect(page.getByLabel("Message text")).toHaveValue("draft ข้อความทดสอบ");

    // Back to list
    await page.getByTestId("mobile-back-btn").click();
    await expect(page.getByTestId("mobile-inbox-header")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toHaveClass(/dashboard-mobile-list/);

    // Resize alone should not storm conversation list
    const convBeforeResize = counters.conversations;
    const msgBeforeResize = counters.messages;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 430, height: 932 });
    await page.waitForTimeout(400);
    expect(counters.conversations - convBeforeResize).toBeLessThanOrEqual(1);
    expect(counters.messages - msgBeforeResize).toBe(0);

    // ── 390 Light / 430 Dark landscape check ──
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 }); // landscape
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.setViewportSize({ width: 430, height: 932 });
    await chooseAppearanceFromOverflow(page, "dark");
    await closeOverflowIfOpen(page);
    expect(await noHorizontalOverflow(page)).toBe(true);

    // ── Tablet two-pane ──
    await page.setViewportSize({ width: 768, height: 1024 });
    await chooseAppearanceFromOverflow(page, "light");
    await closeOverflowIfOpen(page);
    await expect(page.getByTestId("mobile-inbox-header")).toBeVisible();
    await expect(page.getByTestId("dashboard-app-rail")).toBeHidden();
    await openFirstConversation(page);
    await expect(page.getByTestId("mobile-back-btn")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
    await expect(page.locator("section.dashboard-chat")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "tablet-two-pane-light.png");

    // Breakpoint: tablet → mobile keeps selection in chat
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("mobile-back-btn")).toBeVisible();
    await expect(page.locator("h2.conv-header-name")).toContainText("Fixture Customer");

    // Mobile → desktop multi-pane
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId("dashboard-app-rail")).toBeVisible();
    await expect(page.getByTestId("dashboard-app-rail").getByTestId("appearance-menu-trigger")).toBeVisible();
    await expect(page.getByTestId("mobile-inbox-header")).toHaveCount(0);
    await expect(page.locator("h2.conv-header-name")).toContainText("Fixture Customer");
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "desktop-1024-regression.png");

    // Desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId("dashboard-app-rail")).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await shot(page, "desktop-1440-regression.png");

    // 125% zoom equivalent (viewport shrink)
    await page.setViewportSize({ width: Math.round(1440 / 1.25), height: Math.round(900 / 1.25) });
    expect(await noHorizontalOverflow(page)).toBe(true);

    // 200% zoom equivalent
    await page.setViewportSize({ width: Math.round(1440 / 2), height: Math.round(900 / 2) });
    expect(await noHorizontalOverflow(page)).toBe(true);

    // Breakpoint open sheet then resize to desktop must clear inert
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstConversation(page);
    await page.getByTestId("mobile-details-btn").click();
    await expect(page.getByTestId("mobile-details-sheet-panel")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
    await expect(page.getByTestId("mobile-details-sheet-panel")).toHaveCount(0);
    const inertAfterDesktop = await page.evaluate(
      () => document.querySelector("main.dashboard-root")?.hasAttribute("inert") ?? false
    );
    expect(inertAfterDesktop).toBe(false);

    // Sanity: fixture used, not empty
    expect(counters.me).toBeGreaterThan(0);
    expect(counters.conversations).toBeGreaterThan(0);
    expect(counters.messages).toBeGreaterThan(0);
    // Opening chat once should not explode message fetches from resize alone
    expect(counters.messages - msgCountBeforeChat).toBeLessThanOrEqual(4);
    expect(counters.conversations).toBeGreaterThanOrEqual(convCountBeforeChat);
  });
});
