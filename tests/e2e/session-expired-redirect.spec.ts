/**
 * Session-expired redirect smoke (Playwright).
 * Intercepts protected API 401 locally — never expires a real Production token.
 * Requires a non-Production E2E_BASE_URL that already includes this feature branch
 * (or a Preview deployment). Production hosts are skipped intentionally.
 */
import { expect, test, type Page } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;
const PRODUCTION_LIKE_HOSTS = new Set([
  "smartkorp-hub-chat.vercel.app",
  "www.smartkorp-hub-chat.vercel.app"
]);

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function e2eHost(): string {
  try {
    return new URL(process.env.E2E_BASE_URL?.trim() || "http://localhost").hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isProductionLikeE2ETarget(): boolean {
  return PRODUCTION_LIKE_HOSTS.has(e2eHost());
}

function resolveLoginCreds(): { email: string; password: string } | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) return { email: adminEmail, password: adminPassword };
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) return { email: managerEmail, password: managerPassword };
  return null;
}

function missingEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveLoginCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD");
  }
  return missing;
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Session expired redirect", () => {
  test.skip(
    isProductionLikeE2ETarget(),
    "E2E blocker: E2E_BASE_URL points at Production; unreleased session-expired redirect cannot be validated there. Use local/Preview."
  );

  test("login reason=session_expired shows safe notice without auth", async ({ page }) => {
    test.skip(missingBaseEnv().length > 0, `Missing E2E env: ${missingBaseEnv().join(", ")}`);
    await page.goto("/login?reason=session_expired&returnTo=%2Fdashboard");
    await expect(page.getByTestId("login-session-expired-notice")).toBeVisible();
    await expect(page.getByTestId("login-session-expired-notice")).toContainText(
      "Your session has expired. Please sign in again."
    );
    await expect(page.getByText("Unauthorized")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("login-session-expired-notice")).toBeVisible();
  });

  test("unknown reason does not show session-expired notice", async ({ page }) => {
    test.skip(missingBaseEnv().length > 0, `Missing E2E env: ${missingBaseEnv().join(", ")}`);
    await page.goto("/login?reason=other");
    await expect(page.getByTestId("login-session-expired-notice")).toHaveCount(0);
  });

  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("intercepted /api/me 401 redirects once to Login with reason", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    await loginAs(page, creds.email, creds.password);
    await expect(page).toHaveURL(/\/dashboard/);

    let meHits = 0;
    await page.route("**/api/me", async (route) => {
      meHits += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" })
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login\?reason=session_expired/, { timeout: 30_000 });
    await expect(page.getByTestId("login-session-expired-notice")).toBeVisible();
    await expect(page.getByText("Could not load user profile")).toHaveCount(0);
    expect(meHits).toBeGreaterThanOrEqual(1);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("intercepted protected GET 403 does not redirect to Login", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    await loginAs(page, creds.email, creds.password);

    await page.route("**/api/conversations**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forbidden" })
      });
    });

    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("login-session-expired-notice")).toHaveCount(0);
  });
});
