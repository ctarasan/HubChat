/**
 * Channel Settings smoke (Playwright) — health UX + test connection hardening.
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

async function openChannelSettings(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.getByTestId("nav-channel-settings").click();
  await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });
  await expect(page.getByTestId("channel-settings-page")).toBeVisible();
}

function mockTestConnection(
  page: Page,
  channelSegment: "line" | "facebook" | "instagram",
  body: Record<string, unknown>
): void {
  const url = `**/api/channel-settings/${channelSegment}/test-connection`;
  void page.route(url, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body)
    });
  });
}

async function assertNoSecretLeak(page: Page): Promise<void> {
  await expect(page.getByText("must-not-appear")).toHaveCount(0);
  await expect(page.getByText(/Bearer\s+[A-Za-z0-9._-]+/)).toHaveCount(0);
  const secretInput = page.getByTestId("secret-input-channel_access_token").first();
  await expect(secretInput).toHaveValue("");
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

    await expect(page.getByTestId("channel-test-connection-line")).toBeVisible();
    await expect(page.getByTestId("channel-test-connection-facebook")).toBeVisible();
    await expect(page.getByTestId("channel-test-connection-instagram")).toBeVisible();

    const secretInput = page.getByTestId("secret-input-channel_access_token").first();
    await expect(secretInput).toHaveAttribute("type", "password");
    await expect(secretInput).toHaveValue("");

    const pastedToken = `e2e-paste-${"t".repeat(120)}`;
    await secretInput.fill(pastedToken);
    await expect(secretInput).toHaveValue(pastedToken);
    const reloadPromise = page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    await page.getByTestId("channel-settings-reload").click();
    await reloadPromise;
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
    await openChannelSettings(page);

    const reloadPromise = page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    await page.getByTestId("channel-settings-reload").click();
    const reloadRes = await reloadPromise;
    expect(reloadRes.status()).toBe(200);
  });

  test("Mocked LINE test connection shows success and updates last verified", async ({ page }) => {
    await openChannelSettings(page);
    await expect(page.getByTestId("channel-settings-card-line")).toBeVisible();

    mockTestConnection(page, "line", {
      channel: "LINE",
      ok: true,
      status: "READY",
      message: "LINE connection verified (mock).",
      lastVerifiedAt: "2026-05-21T10:00:00.000Z",
      lastError: null,
      access_token: "must-not-appear"
    });

    await page.getByTestId("channel-test-connection-line").click();
    await expect(page.getByTestId("channel-test-feedback-line")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("channel-test-feedback-line")).toContainText("LINE connection verified");
    await expect(page.getByTestId("channel-status-line")).toContainText(/Ready/i);
    await expect(page.getByTestId("channel-last-verified-line")).not.toContainText(/Never verified/i);
    await expect(page.getByTestId("channel-last-error-line")).toContainText(/None recorded/i);
    await assertNoSecretLeak(page);
  });

  test("Mocked FACEBOOK test connection shows NOT_CONFIGURED warn safely", async ({ page }) => {
    await openChannelSettings(page);

    mockTestConnection(page, "facebook", {
      channel: "FACEBOOK",
      ok: false,
      status: "NOT_CONFIGURED",
      message: "Facebook channel is not configured (mock).",
      lastVerifiedAt: null,
      lastError: null,
      page_access_token: "must-not-appear"
    });

    await page.getByTestId("channel-test-connection-facebook").click();
    await expect(page.getByTestId("channel-test-feedback-facebook")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("channel-test-feedback-facebook")).toContainText(/not configured/i);
    await expect(page.getByTestId("channel-test-feedback-facebook")).toHaveClass(/channel-settings-test-feedback-warn/);
    await expect(page.getByTestId("channel-status-facebook")).toContainText(/Not configured/i);
    await expect(page.getByTestId("channel-health-hint-facebook")).toBeVisible();
    await assertNoSecretLeak(page);
  });

  test("Mocked INSTAGRAM test connection shows ERROR feedback and last error", async ({ page }) => {
    await openChannelSettings(page);

    mockTestConnection(page, "instagram", {
      channel: "INSTAGRAM",
      ok: false,
      status: "ERROR",
      message: "Instagram test failed (mock).",
      lastVerifiedAt: null,
      lastError: "Invalid OAuth token",
      access_token: "must-not-appear"
    });

    await page.getByTestId("channel-test-connection-instagram").click();
    await expect(page.getByTestId("channel-test-feedback-instagram")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("channel-test-feedback-instagram")).toContainText(/Instagram test failed/i);
    await expect(page.getByTestId("channel-last-error-instagram")).toContainText("Invalid OAuth token");
    await expect(page.getByTestId("channel-health-hint-instagram")).toBeVisible();
    await assertNoSecretLeak(page);
  });

  test("Facebook providerPageId save sends metadata only in PATCH", async ({ page }) => {
    await openChannelSettings(page);
    await expect(page.getByTestId("channel-provider-fields-facebook")).toBeVisible();

    let patchBody = "";
    await page.route("**/api/channel-settings/facebook", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      patchBody = route.request().postData() ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            channel: "FACEBOOK",
            enabled: true,
            configured: true,
            status: "READY",
            providerPageId: "1137356672785125",
            providerAccountName: null,
            lastVerifiedAt: null,
            lastError: null,
            updatedAt: "2026-05-21T12:00:00.000Z",
            secretState: { accessToken: "SET", appSecret: "EMPTY", verifyToken: "EMPTY" }
          }
        })
      });
    });

    await page.getByTestId("channel-provider-page-id-facebook").fill("1137356672785125");
    await page.getByTestId("channel-settings-save-facebook").click();
    await expect(page.getByTestId("channel-settings-save-success")).toBeVisible({ timeout: 30_000 });

    expect(patchBody.length).toBeGreaterThan(0);
    const parsed = JSON.parse(patchBody) as {
      providerPageId?: string;
      secrets?: Record<string, string>;
      clearSecrets?: string[];
    };
    expect(parsed.providerPageId).toBe("1137356672785125");
    expect(parsed.secrets).toBeUndefined();
    expect(parsed.clearSecrets).toBeUndefined();
    await expect(page.getByTestId("channel-test-connection-facebook")).toBeVisible();
  });

  test("Save without secret input does not send secrets in PATCH body", async ({ page }) => {
    await openChannelSettings(page);
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
