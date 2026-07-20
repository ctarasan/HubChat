/**
 * Message Templates V1 smoke (Playwright).
 * Uses local/test auth env. Never sends outbound customer messages.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

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

function isOutboundMutation(response: Response): boolean {
  const method = response.request().method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    const { pathname } = new URL(response.url());
    if (method === "POST" && pathname === "/api/messages/send") return true;
    if (method === "POST" && /^\/api\/messages\/upload-/.test(pathname)) return true;
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

const SAMPLE_TITLE = "ราคาและโปรโมชั่น Package S";
const SAMPLE_BODY = `ราคาและโปรโมชั่นตอนนี้นะครับ

Package S ซื้อแบบรายปี 11,880.- (เดือนละ 990.-) ครับ
- รองรับสมาชิกไม่เกิน 1,000 คน
- ฟรี ออกแบบการ์ดและระบบสมาชิกให้เข้ากับแบรนด์ของคุณ`;

test.describe("Message templates V1 smoke", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("create, search, insert without send, edit, delete", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    page.on("response", (response) => {
      if (isOutboundMutation(response)) {
        throw new Error(`Unexpected outbound mutation during templates smoke: ${response.url()}`);
      }
    });

    await loginAs(page, creds.email, creds.password);
    const listItem = page.locator(".conversation-list-item").first();
    if ((await listItem.count()) === 0) {
      test.skip(true, "No conversations available for templates smoke");
      return;
    }
    await listItem.click();

    const trigger = page.getByTestId("message-templates-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId("message-templates-panel")).toBeVisible();

    await page.getByTestId("message-templates-add").click();
    await page.getByTestId("message-template-title-input").fill(SAMPLE_TITLE);
    await page.getByTestId("message-template-body-input").fill(SAMPLE_BODY);
    await page.getByTestId("message-template-form-save").click();
    await expect(page.getByTestId("message-templates-list")).toBeVisible();

    await page.reload();
    await listItem.click();
    await trigger.click();
    await page.getByTestId("message-templates-search").fill("Package S");
    await expect(page.getByText(SAMPLE_TITLE).first()).toBeVisible();

    const composer = page.getByLabel("Message text");
    await composer.fill("มีข้อความอยู่แล้ว");
    await page.getByText(SAMPLE_TITLE).first().click();
    const value = await composer.inputValue();
    expect(value.includes("มีข้อความอยู่แล้ว")).toBeTruthy();
    expect(value.includes(SAMPLE_BODY)).toBeTruthy();
    expect(value.includes("\n\n")).toBeTruthy();

    await trigger.click();
    await page.getByRole("button", { name: `Edit template ${SAMPLE_TITLE}` }).click();
    await page.getByTestId("message-template-title-input").fill(`${SAMPLE_TITLE} edited`);
    await page.getByTestId("message-template-form-save").click();

    await page.getByRole("button", { name: `Delete template ${SAMPLE_TITLE} edited` }).click();
    await expect(page.getByTestId("message-templates-delete-confirm")).toBeVisible();
    await page.getByTestId("message-template-delete-confirm").click();
    await expect(page.getByText(`${SAMPLE_TITLE} edited`)).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(trigger).toBeVisible();
  });
});
