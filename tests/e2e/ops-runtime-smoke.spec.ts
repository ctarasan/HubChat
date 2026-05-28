/**
 * Read-only Ops Runtime smoke (Playwright).
 * ADMIN only — does not mutate queue or outbox.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"] as const;

function missingEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function isOpsRuntimeGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/ops/runtime";
  } catch {
    return false;
  }
}

async function loginAsAdmin(page: Page): Promise<void> {
  const email = process.env.E2E_ADMIN_EMAIL!.trim();
  const password = process.env.E2E_ADMIN_PASSWORD!.trim();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Ops Runtime smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("ADMIN can open Ops Runtime and load runtime API", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByTestId("nav-ops-runtime")).toBeVisible();

    const runtimePromise = page.waitForResponse(isOpsRuntimeGet, { timeout: 60_000 });
    await page.getByTestId("nav-ops-runtime").click();
    await page.waitForURL(/\/dashboard\/ops$/, { timeout: 30_000 });

    await expect(page.getByTestId("ops-runtime-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ops Runtime" })).toBeVisible();
    await expect(page.getByText(/not tenant sales metrics/i)).toBeVisible();

    const runtimeResponse = await runtimePromise;
    expect(runtimeResponse.status(), "GET /api/ops/runtime must succeed for ADMIN").toBe(200);

    const body = (await runtimeResponse.json()) as {
      data?: { health?: { level?: string }; queue?: { depth?: number } };
    };
    expect(body.data?.health?.level).toBeTruthy();
    expect(typeof body.data?.queue?.depth).toBe("number");

    await expect(page.getByTestId("ops-runtime-health-banner")).toBeVisible();
    await expect(page.getByTestId("ops-runtime-stat-card").first()).toBeVisible();
    await expect(page.getByTestId("ops-runtime-triage-hint")).toBeVisible();
    await expect(page.getByTestId("ops-runtime-worker-detail-heading")).toBeVisible();
    await expect(page.getByTestId("ops-runtime-queue-inbound-pending")).toBeVisible();
    await expect(page.getByTestId("ops-runtime-outbox-pending")).toBeVisible();
    await expect(page.getByText(/unread inbox badges are not queue pending/i)).toBeVisible();
    await expect(page.getByText(/historical failed jobs/i)).toBeVisible();

    await page.getByTestId("ops-runtime-refresh").click();
    const refreshResponse = await page.waitForResponse(isOpsRuntimeGet, { timeout: 60_000 });
    expect(refreshResponse.ok()).toBe(true);
  });
});
