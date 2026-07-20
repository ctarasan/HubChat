/**
 * Compact chat message layout smoke (Playwright).
 * Asserts bubble/timestamp placement and unread helper removal.
 * Read-only for messaging APIs when possible; skips without E2E env.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function resolveLoginCreds(): { email: string; password: string } | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) {
    return { email: adminEmail, password: adminPassword };
  }
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) {
    return { email: managerEmail, password: managerPassword };
  }
  return null;
}

function missingEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveLoginCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD");
  }
  return missing;
}

function isConversationsMutation(response: Response): boolean {
  const method = response.request().method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    const { pathname } = new URL(response.url());
    if (method === "POST" && pathname === "/api/messages/send") return true;
    if (method === "POST" && /^\/api\/messages\/upload-/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/follow-up$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(assignment|status|lead-status)$/.test(pathname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Compact chat message layout smoke", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("unread helper gone; timestamps beside compact bubbles", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    page.on("response", (response) => {
      if (isConversationsMutation(response)) {
        throw new Error(`Unexpected messaging mutation during compact-layout smoke: ${response.url()}`);
      }
    });

    await loginAs(page, creds.email, creds.password);
    await expect(page.getByTestId("inbox-filters-drawer-open")).toBeVisible();
    await expect(page.getByTestId("inbox-unread-badge-help")).toHaveCount(0);
    await expect(
      page.getByText("Unread means the message is already received and processed, but not yet read by an agent.")
    ).toHaveCount(0);

    const listItem = page.locator(".conversation-list-item").first();
    if ((await listItem.count()) === 0) {
      test.skip(true, "No conversations available for layout smoke");
      return;
    }
    await listItem.click();
    await expect(page.locator("ul.message-list")).toBeVisible();

    const inbound = page.getByTestId("msg-row-inbound").first();
    const outbound = page.getByTestId("msg-row-outbound").first();

    if ((await inbound.count()) > 0) {
      const layout = await inbound.evaluate((row) => {
        const bubble = row.querySelector('[data-testid="msg-bubble"]') as HTMLElement | null;
        const time = row.querySelector('[data-testid="msg-time"]') as HTMLElement | null;
        if (!bubble || !time) return null;
        const kids = [...row.children].map((el) => (el as HTMLElement).dataset.testid);
        const br = bubble.getBoundingClientRect();
        const tr = time.getBoundingClientRect();
        return {
          kids,
          bubbleInsideHasTime: Boolean(bubble.querySelector('[data-testid="msg-time"]')),
          timeAfterBubble: kids.indexOf("msg-time") > kids.indexOf("msg-bubble"),
          timeRightOfBubble: tr.left >= br.right - 1,
          bubbleNotFullWidth: br.width < row.getBoundingClientRect().width * 0.95,
          timeNowrap: getComputedStyle(time).whiteSpace === "nowrap"
        };
      });
      expect(layout).not.toBeNull();
      expect(layout!.bubbleInsideHasTime).toBe(false);
      expect(layout!.timeAfterBubble).toBe(true);
      expect(layout!.timeRightOfBubble).toBe(true);
      expect(layout!.bubbleNotFullWidth).toBe(true);
      expect(layout!.timeNowrap).toBe(true);
    }

    if ((await outbound.count()) > 0) {
      const layout = await outbound.evaluate((row) => {
        const bubble = row.querySelector('[data-testid="msg-bubble"]') as HTMLElement | null;
        const time = row.querySelector('[data-testid="msg-time"]') as HTMLElement | null;
        if (!bubble || !time) return null;
        const kids = [...row.children].map((el) => (el as HTMLElement).dataset.testid);
        const br = bubble.getBoundingClientRect();
        const tr = time.getBoundingClientRect();
        return {
          kids,
          bubbleInsideHasTime: Boolean(bubble.querySelector('[data-testid="msg-time"]')),
          timeBeforeBubble: kids.indexOf("msg-time") < kids.indexOf("msg-bubble"),
          timeLeftOfBubble: tr.right <= br.left + 1,
          bubbleNotFullWidth: br.width < row.getBoundingClientRect().width * 0.95
        };
      });
      expect(layout).not.toBeNull();
      expect(layout!.bubbleInsideHasTime).toBe(false);
      expect(layout!.timeBeforeBubble).toBe(true);
      expect(layout!.timeLeftOfBubble).toBe(true);
      expect(layout!.bubbleNotFullWidth).toBe(true);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("ul.message-list")).toBeVisible();
  });
});
