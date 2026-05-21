/**
 * Channel Settings smoke (Playwright) — Phase II-G2-B secret-state UX.
 * ADMIN only. Requires E2E_BASE_URL and admin credentials.
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

  test("ADMIN can open Channel Settings with blank secret inputs and state badges", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByTestId("nav-channel-settings")).toBeVisible();

    const listPromise = page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    await page.getByTestId("nav-channel-settings").click();
    await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });

    await expect(page.getByTestId("channel-settings-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Channel Settings" })).toBeVisible();
    await expect(page.getByText(/Leave blank to keep existing secret/i)).toBeVisible();
    await expect(page.getByText(/write-only/i)).toBeVisible();

    const listRes = await listPromise;
    expect(listRes.status()).toBe(200);
    const reqHeaders = listRes.request().headers();
    expect(reqHeaders["x-tenant-id"] || reqHeaders["X-Tenant-Id"]).toBeTruthy();

    const bodyText = await listRes.text();
    expect(bodyText.includes("secret_json")).toBe(false);
    expect(bodyText.toLowerCase().includes("line-secret")).toBe(false);

    await expect(page.getByTestId("channel-settings-card-line")).toBeVisible();
    await expect(page.getByTestId("channel-settings-card-facebook")).toBeVisible();
    await expect(page.getByTestId("channel-settings-card-instagram")).toBeVisible();

    const secretInput = page.getByTestId("secret-input-channel_access_token").first();
    await expect(secretInput).toHaveAttribute("type", "password");
    await expect(secretInput).toHaveValue("");

    const lineCard = page.getByTestId("channel-settings-card-line");
    await expect(lineCard.getByTestId("channel-status-line")).toBeVisible();

    const stateBadges = lineCard.locator('[data-testid^="secret-state-"]');
    const badgeCount = await stateBadges.count();
    if (badgeCount > 0) {
      const firstText = (await stateBadges.first().textContent())?.trim() ?? "";
      expect(firstText === "SET" || firstText === "EMPTY").toBe(true);
    }
  });

  test("Reload refetches channel settings", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("nav-channel-settings").click();
    await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });
    await expect(page.getByTestId("channel-settings-page")).toBeVisible();

    const reloadPromise = page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    await page.getByTestId("channel-settings-reload").click();
    const reloadRes = await reloadPromise;
    expect(reloadRes.status()).toBe(200);
  });

  test("Save without secret input does not send secrets in PATCH body", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("nav-channel-settings").click();
    await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });
    await expect(page.getByTestId("channel-settings-card-line")).toBeVisible();

    let patchBody = "";
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/api/channel-settings/line")) {
        patchBody = req.postData() ?? "";
      }
    });

    const enabled = page.getByTestId("channel-settings-card-line").getByRole("checkbox");
    const wasChecked = await enabled.isChecked();
    if (wasChecked) {
      await enabled.uncheck();
    } else {
      await enabled.check();
    }

    await page.getByTestId("channel-settings-save-line").click();
    await expect(page.getByTestId("channel-settings-save-success")).toBeVisible({ timeout: 30_000 });

    if (patchBody) {
      const parsed = JSON.parse(patchBody) as { secrets?: Record<string, string> };
      expect(parsed.secrets).toBeUndefined();
    }

    if (wasChecked) {
      await enabled.check();
    } else {
      await enabled.uncheck();
    }
    await page.getByTestId("channel-settings-save-line").click();
    await expect(page.getByTestId("channel-settings-save-success")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("Channel Settings access control", () => {
  test.skip(missingEnv().length > 0, "Missing E2E env");

  test("non-admin cannot access channel settings API from inbox", async ({ page }) => {
    test.skip(!process.env.E2E_MANAGER_EMAIL?.trim(), "E2E_MANAGER_EMAIL not set");

    await page.goto("/login");
    await page.getByTestId("login-email").fill(process.env.E2E_MANAGER_EMAIL!.trim());
    await page.getByTestId("login-password").fill(process.env.E2E_MANAGER_PASSWORD!.trim());
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });

    let channelSettingsGetCount = 0;
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes("/api/channel-settings")) {
        channelSettingsGetCount += 1;
      }
    });

    await page.goto("/dashboard/channel-settings");
    await expect(page.getByTestId("channel-settings-access-denied")).toBeVisible({ timeout: 30_000 });
    expect(channelSettingsGetCount).toBe(0);
  });
});
