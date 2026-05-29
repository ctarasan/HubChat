/**
 * Read-only system theme smoke (Playwright).
 * Verifies Dashboard shell in light and dark color schemes without mutations.
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

function missingThemeEnv(): string[] {
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
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(assignment|status|lead-status)$/.test(pathname)) return true;
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

async function assertDashboardShellReadOnly(page: Page): Promise<void> {
  await expect(page.locator("main.dashboard-root")).toBeVisible();
  await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
  const list = page.locator(".conversation-list[role='list']");
  await expect(list).toBeVisible();
  const rowCount = await page.locator(".conversation-list-item").count();
  if (rowCount === 0) {
    await expect(page.getByTestId("inbox-sidebar-empty")).toBeVisible();
  } else {
    await expect(page.locator("section.dashboard-chat")).toBeVisible();
    await expect(page.locator("footer.chat-composer, .chat-composer")).toBeVisible();
  }
}

test.describe("System theme smoke (read-only)", () => {
  const missing = missingThemeEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  for (const scheme of ["light", "dark"] as const) {
    test(`Dashboard shell visible with color scheme ${scheme}`, async ({ page }) => {
      const creds = resolveLoginCreds();
      if (!creds) {
        test.skip(true, "No Admin or Manager credentials configured");
        return;
      }

      const mutationResponses: Response[] = [];
      page.on("response", (response) => {
        if (isConversationsMutation(response)) mutationResponses.push(response);
      });

      await page.emulateMedia({ colorScheme: scheme });
      await loginAs(page, creds.email, creds.password);
      await assertDashboardShellReadOnly(page);

      expect(
        mutationResponses.length,
        "Theme smoke must not trigger send/upload/follow-up/assignment/status mutations"
      ).toBe(0);
    });
  }
});
