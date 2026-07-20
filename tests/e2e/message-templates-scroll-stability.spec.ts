/**
 * Regression: Message Templates panel must not oscillate document scroll.
 */
import { expect, test, type Page } from "@playwright/test";

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

async function sampleScrollStability(page: Page, durationMs = 900) {
  return page.evaluate(async (duration) => {
    const start = performance.now();
    const scrollSamples: number[] = [];
    const panelTopSamples: number[] = [];
    while (performance.now() - start < duration) {
      scrollSamples.push(window.scrollY);
      const panel = document.querySelector('[data-testid="message-templates-panel"]');
      panelTopSamples.push(panel ? panel.getBoundingClientRect().top : -1);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const range = (values: number[]) => {
      const filtered = values.filter((v) => v >= 0);
      if (filtered.length === 0) return 0;
      return Math.max(...filtered) - Math.min(...filtered);
    };
    return {
      scrollRange: range(scrollSamples),
      panelTopRange: range(panelTopSamples),
      sampleCount: scrollSamples.length
    };
  }, durationMs);
}

test.describe("Message templates scroll stability", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "narrow", width: 390, height: 844 }
  ]) {
    test(`panel open/add/edit keeps scrollY stable (${viewport.name})`, async ({ page }) => {
      const creds = resolveLoginCreds();
      if (!creds) {
        test.skip(true, "No Admin or Manager credentials configured");
        return;
      }

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAs(page, creds.email, creds.password);

      const listItem = page.locator(".conversation-list-item").first();
      if ((await listItem.count()) === 0) {
        test.skip(true, "No conversations available for scroll stability test");
        return;
      }
      await listItem.click();

      const baselineScrollY = await page.evaluate(() => window.scrollY);
      const trigger = page.getByTestId("message-templates-trigger");
      await trigger.click();
      await expect(page.getByTestId("message-templates-panel")).toBeVisible();

      let stability = await sampleScrollStability(page);
      expect(stability.scrollRange).toBeLessThanOrEqual(1);
      expect(stability.panelTopRange).toBeLessThanOrEqual(1);

      await page.getByTestId("message-templates-add").click();
      await expect(page.getByTestId("message-templates-form")).toBeVisible();
      stability = await sampleScrollStability(page);
      expect(stability.scrollRange).toBeLessThanOrEqual(1);
      expect(stability.panelTopRange).toBeLessThanOrEqual(1);

      await page.getByTestId("message-template-title-input").focus();
      await page.getByTestId("message-template-body-input").focus();
      stability = await sampleScrollStability(page);
      expect(stability.scrollRange).toBeLessThanOrEqual(1);
      expect(stability.panelTopRange).toBeLessThanOrEqual(1);

      await page.getByTestId("message-template-form-cancel").click();
      const firstTitle = page.locator(".message-templates-item-title").first();
      if ((await firstTitle.count()) > 0) {
        const title = (await firstTitle.textContent())?.trim() ?? "";
        await page.getByRole("button", { name: `Edit template ${title}` }).click();
        await expect(page.getByTestId("message-templates-form")).toBeVisible();
        stability = await sampleScrollStability(page);
        expect(stability.scrollRange).toBeLessThanOrEqual(1);
        expect(stability.panelTopRange).toBeLessThanOrEqual(1);
        await page.getByTestId("message-template-form-cancel").click();
      }

      await page.keyboard.press("Escape");
      await expect(page.getByTestId("message-templates-panel")).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(baselineScrollY);
    });
  }
});
