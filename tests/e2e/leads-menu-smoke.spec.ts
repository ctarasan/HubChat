/**
 * Read-only Leads pipeline smoke (Playwright).
 * Does not mutate leads or conversations.
 */
import { expect, test, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function resolveLoginCreds(): { email: string; password: string } | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) return { email: adminEmail, password: adminPassword };
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) return { email: managerEmail, password: managerPassword };
  const salesEmail = process.env.E2E_SALES_EMAIL?.trim();
  const salesPassword = process.env.E2E_SALES_PASSWORD?.trim();
  if (salesEmail && salesPassword) return { email: salesEmail, password: salesPassword };
  return null;
}

function missingLeadsEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveLoginCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD, E2E_MANAGER_*, or E2E_SALES_*");
  }
  return missing;
}

function isLeadsListGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/leads";
  } catch {
    return false;
  }
}

function isLeadsMutation(response: Response): boolean {
  const method = response.request().method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    return new URL(response.url()).pathname.startsWith("/api/leads");
  } catch {
    return false;
  }
}

test.describe("Leads menu smoke (read-only)", () => {
  const missing = missingLeadsEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("Leads page loads shell without 500 on GET /api/leads", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No credentials configured");
      return;
    }

    const mutationResponses: Response[] = [];
    page.on("response", (response) => {
      if (isLeadsMutation(response)) mutationResponses.push(response);
    });

    const leadsListStatus: { value: number | null } = { value: null };
    page.on("response", (response) => {
      if (isLeadsListGet(response)) leadsListStatus.value = response.status();
    });

    await page.goto("/login");
    await page.getByTestId("login-email").fill(creds.email);
    await page.getByTestId("login-password").fill(creds.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });

    await page.goto("/dashboard/leads");
    await expect(page.getByTestId("leads-page")).toBeVisible();
    await expect(page.getByTestId("nav-leads")).toBeVisible();
    await expect(page.getByTestId("leads-filters")).toBeVisible();

    await page.waitForTimeout(2000);
    if (leadsListStatus.value !== null) {
      expect(leadsListStatus.value, "GET /api/leads must not return 500").not.toBe(500);
    }

    const hasTable = await page.getByTestId("leads-table-wrap").isVisible().catch(() => false);
    const hasEmpty = await page.getByTestId("leads-empty").isVisible().catch(() => false);
    const hasError = await page.getByTestId("leads-error").isVisible().catch(() => false);
    const hasLoading = await page.getByTestId("leads-loading").isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasError || hasLoading).toBe(true);

    expect(mutationResponses.length, "Read-only smoke must not mutate leads").toBe(0);
  });
});
