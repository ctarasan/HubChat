/**
 * Appearance preference smoke (Playwright).
 * Covers system + forced light/dark with persistence. Read-only for messaging APIs.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;
const APPEARANCE_KEY = "hubchat.appearance";

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

async function readAppBg(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-bg").trim());
}

async function chooseAppearance(page: Page, value: "system" | "light" | "dark"): Promise<void> {
  await page.getByTestId("appearance-menu-trigger").click();
  await expect(page.getByTestId("appearance-menu-list")).toBeVisible();
  await page.getByTestId(`appearance-option-${value}`).click();
  await expect(page.getByTestId("appearance-menu-list")).toHaveCount(0);
}

test.describe("Appearance preference smoke (read-only)", () => {
  const missing = missingThemeEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("system light/dark and forced overrides with persistence", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    const mutationResponses: Response[] = [];
    page.on("response", (response) => {
      if (isConversationsMutation(response)) mutationResponses.push(response);
    });

    await page.addInitScript((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }, APPEARANCE_KEY);

    await page.emulateMedia({ colorScheme: "light" });
    await loginAs(page, creds.email, creds.password);
    await expect(page.getByTestId("appearance-menu-trigger")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    const systemLightBg = await readAppBg(page);
    expect(systemLightBg.toLowerCase()).toBe("#f3f4f6");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(async () => (await readAppBg(page)).toLowerCase()).toBe("#0a0a0a");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");

    await chooseAppearance(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(async () => (await readAppBg(page)).toLowerCase()).toBe("#f3f4f6");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(async () => (await readAppBg(page)).toLowerCase()).toBe("#f3f4f6");

    await page.emulateMedia({ colorScheme: "light" });
    await chooseAppearance(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await readAppBg(page)).toLowerCase()).toBe("#0a0a0a");

    await chooseAppearance(page, "system");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    await expect.poll(async () => (await readAppBg(page)).toLowerCase()).toBe("#f3f4f6");

    expect(
      mutationResponses.length,
      "Appearance smoke must not trigger send/upload/follow-up/assignment/status mutations"
    ).toBe(0);
  });
});
