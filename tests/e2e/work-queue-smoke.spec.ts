/**
 * Read-only Work Queue smoke (Playwright).
 * ADMIN/MANAGER/SALES can open /dashboard/work-queue; GET workflow APIs only on load.
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

function isWorkflowSummaryGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/workflow/summary";
  } catch {
    return false;
  }
}

function isWorkflowItemsGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    const u = new URL(response.url());
    return u.pathname === "/api/workflow/items" && u.searchParams.get("kind") === "follow_up";
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

test.describe("Work Queue smoke (read-only)", () => {
  test("ADMIN opens work queue and uses workflow GET endpoints", async ({ page }) => {
    const missing = missingAdminEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    const mutations: string[] = [];
    page.on("response", (res) => {
      if (isMutationRequest(res)) mutations.push(`${res.request().method()} ${res.url()}`);
    });

    await login(page, process.env.E2E_ADMIN_EMAIL!.trim(), process.env.E2E_ADMIN_PASSWORD!.trim());

    await expect(page.getByTestId("nav-work-queue")).toBeVisible();

    const summaryPromise = page.waitForResponse(isWorkflowSummaryGet, { timeout: 60_000 });
    const itemsPromise = page.waitForResponse(isWorkflowItemsGet, { timeout: 60_000 });
    await page.getByTestId("nav-work-queue").click();
    await page.waitForURL(/\/dashboard\/work-queue/, { timeout: 30_000 });

    await expect(page.getByTestId("work-queue-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Work Queue" })).toBeVisible();

    expect((await summaryPromise).status()).toBeLessThan(500);
    expect((await itemsPromise).status()).toBeLessThan(500);

    await expect(page.getByTestId("work-queue-summary")).toBeVisible();
    await expect(page.getByTestId("work-queue-scope-team")).toBeVisible();

    const overduePromise = page.waitForResponse(
      (res) => isWorkflowItemsGet(res) && res.url().includes("status=overdue"),
      { timeout: 60_000 }
    );
    await page.getByTestId("work-queue-status-overdue").click();
    await overduePromise;

    expect(mutations.length).toBe(0);
  });

  test("SALES sees mine-only hint and no team scope control", async ({ page }) => {
    const missing = missingSalesEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    const mutations: string[] = [];
    page.on("response", (res) => {
      if (isMutationRequest(res)) mutations.push(`${res.request().method()} ${res.url()}`);
    });

    await login(page, process.env.E2E_SALES_EMAIL!.trim(), process.env.E2E_SALES_PASSWORD!.trim());

    await page.goto("/dashboard/work-queue");
    await expect(page.getByTestId("work-queue-page")).toBeVisible();
    await expect(page.getByTestId("work-queue-sales-hint")).toBeVisible();
    await expect(page.getByTestId("work-queue-scope-team")).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId("work-queue-summary")).toBeVisible();

    expect(mutations.length).toBe(0);
  });
});
