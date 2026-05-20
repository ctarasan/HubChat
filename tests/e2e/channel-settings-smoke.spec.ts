/**
 * Channel Settings smoke (Playwright).
 * ADMIN only — reads settings; optional PATCH only if E2E_CHANNEL_SETTINGS_ALLOW_PATCH=true.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED = ["E2E_BASE_URL", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"] as const;

function missingEnv(): string[] {
  return REQUIRED.filter((n) => !process.env[n]?.trim());
}

function isChannelSettingsGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/channel-settings";
  } catch {
    return false;
  }
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(process.env.E2E_ADMIN_EMAIL!.trim());
  await page.getByTestId("login-password").fill(process.env.E2E_ADMIN_PASSWORD!.trim());
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Channel Settings smoke", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("ADMIN can open Channel Settings and load safe list", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByTestId("nav-channel-settings")).toBeVisible();

    const listPromise = page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    await page.getByTestId("nav-channel-settings").click();
    await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });

    await expect(page.getByTestId("channel-settings-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Channel Settings" })).toBeVisible();
    await expect(page.getByText(/runtime cutover is completed/i)).toBeVisible();

    const listRes = await listPromise;
    expect(listRes.status()).toBe(200);
    const bodyText = await listRes.text();
    expect(bodyText.includes("secret_json")).toBe(false);
    expect(bodyText.toLowerCase().includes("line-secret")).toBe(false);

    await expect(page.getByTestId("channel-settings-card-line")).toBeVisible();
    await expect(page.getByTestId("channel-settings-card-facebook")).toBeVisible();
    await expect(page.getByTestId("channel-settings-card-instagram")).toBeVisible();

    const secretInput = page.getByTestId("secret-input-channel_access_token").first();
    await expect(secretInput).toHaveAttribute("type", "password");
    await expect(secretInput).toHaveValue("");
  });
});
