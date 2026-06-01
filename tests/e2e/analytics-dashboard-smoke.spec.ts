/**
 * Read-only Analytics Dashboard smoke (Playwright).
 * ADMIN/MANAGER can load overview; SALES must not see nav and gets safe denied on direct URL.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

function missingAdminEnv(): string[] {
  const names = ["E2E_BASE_URL", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"] as const;
  return names.filter((n) => !process.env[n]?.trim());
}

function missingSalesEnv(): string[] {
  const names = ["E2E_BASE_URL", "E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"] as const;
  return names.filter((n) => !process.env[n]?.trim());
}

function isAnalyticsOverviewGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/analytics/overview";
  } catch {
    return false;
  }
}

function isMutationRequest(response: Response): boolean {
  const method = response.request().method();
  return method !== "GET" && method !== "HEAD";
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Analytics dashboard smoke (read-only)", () => {
  test("ADMIN can open Analytics and switch range without mutations", async ({ page }) => {
    const missing = missingAdminEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    const mutations: string[] = [];
    page.on("response", (res) => {
      if (isMutationRequest(res)) mutations.push(`${res.request().method()} ${res.url()}`);
    });

    await login(page, process.env.E2E_ADMIN_EMAIL!.trim(), process.env.E2E_ADMIN_PASSWORD!.trim());

    await expect(page.getByTestId("nav-analytics")).toBeVisible();

    const overviewPromise = page.waitForResponse(isAnalyticsOverviewGet, { timeout: 60_000 });
    await page.getByTestId("nav-analytics").click();
    await page.waitForURL(/\/dashboard\/analytics$/, { timeout: 30_000 });

    await expect(page.getByTestId("analytics-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

    const overviewResponse = await overviewPromise;
    expect(overviewResponse.status()).toBe(200);
    const body = (await overviewResponse.json()) as {
      data?: { range?: string; summaryCards?: unknown[]; meta?: { version?: number } };
    };
    expect(body.data?.meta?.version).toBe(1);
    expect(body.data?.range).toBeTruthy();

    await expect(page.getByTestId("analytics-summary")).toBeVisible();
    await expect(page.getByTestId("analytics-range-7d")).toBeVisible();

    const todayPromise = page.waitForResponse(
      (res) => isAnalyticsOverviewGet(res) && res.url().includes("range=today"),
      { timeout: 60_000 }
    );
    await page.getByTestId("analytics-range-today").click();
    const todayRes = await todayPromise;
    expect(todayRes.ok()).toBe(true);

    const d30Promise = page.waitForResponse(
      (res) => isAnalyticsOverviewGet(res) && res.url().includes("range=30d"),
      { timeout: 60_000 }
    );
    await page.getByTestId("analytics-range-30d").click();
    const d30Res = await d30Promise;
    expect(d30Res.ok()).toBe(true);

    expect(mutations.length, `Unexpected mutations: ${mutations.join("; ")}`).toBe(0);
  });

  test("MANAGER can open Analytics when credentials configured", async ({ page }) => {
    const missing = ["E2E_BASE_URL", "E2E_MANAGER_EMAIL", "E2E_MANAGER_PASSWORD"].filter(
      (n) => !process.env[n]?.trim()
    );
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    await login(page, process.env.E2E_MANAGER_EMAIL!.trim(), process.env.E2E_MANAGER_PASSWORD!.trim());

    await expect(page.getByTestId("nav-analytics")).toBeVisible();
    const overviewPromise = page.waitForResponse(isAnalyticsOverviewGet, { timeout: 60_000 });
    await page.getByTestId("nav-analytics").click();
    await page.waitForURL(/\/dashboard\/analytics$/, { timeout: 30_000 });
    const res = await overviewPromise;
    expect(res.status()).toBe(200);
    await expect(page.getByTestId("analytics-page")).toBeVisible();
  });

  test("SALES does not see Analytics nav and direct URL is access denied", async ({ page }) => {
    const missing = missingSalesEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    await login(page, process.env.E2E_SALES_EMAIL!.trim(), process.env.E2E_SALES_PASSWORD!.trim());

    await expect(page.getByTestId("nav-analytics")).toHaveCount(0);

    await page.goto("/dashboard/analytics");
    await expect(page.getByTestId("analytics-page")).toBeVisible();
    await expect(page.getByTestId("analytics-access-denied")).toBeVisible();
    await expect(page.getByText(/ไม่มีสิทธิ์เข้าถึงหน้านี้/)).toBeVisible();
  });
});
