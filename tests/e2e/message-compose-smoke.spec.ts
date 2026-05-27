/**
 * Composer + attachment read-only smoke (Playwright).
 *
 * Verifies composer shell and attachment affordances without sending messages.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

type LoginCreds = { email: string; password: string; role: "ADMIN" | "MANAGER" };

function resolveLoginCreds(): LoginCreds | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) return { email: adminEmail, password: adminPassword, role: "ADMIN" };

  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) return { email: managerEmail, password: managerPassword, role: "MANAGER" };

  return null;
}

function missingEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveLoginCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD");
  }
  return missing;
}

function isConversationsListGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/conversations";
  } catch {
    return false;
  }
}

function isMutationRequest(response: Response): boolean {
  const method = response.request().method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    const { pathname } = new URL(response.url());
    if (method === "POST" && pathname === "/api/messages/send") return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/follow-up$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(assignment|status|lead-status)$/.test(pathname)) return true;
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

test.describe("Composer attachment smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("manager/admin sees composer + attachment affordances without mutations", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    const mutationResponses: Response[] = [];
    page.on("response", (response) => {
      if (isMutationRequest(response)) mutationResponses.push(response);
    });

    await loginAs(page, creds.email, creds.password);

    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();

    const listPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
    await page.getByRole("button", { name: "Reload" }).click();
    const listRes = await listPromise;

    expect(listRes.status(), `GET /api/conversations must not return 500, got ${listRes.status()}`).not.toBe(500);
    expect(listRes.ok(), `GET /api/conversations failed with status ${listRes.status()}`).toBe(true);

    const rows = page.locator(".conversation-list-item");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      await expect(page.getByText("No conversations loaded.")).toBeVisible();
      expect(mutationResponses.length, "Read-only composer smoke must not trigger mutations when inbox is empty").toBe(0);
      return;
    }

    await rows.first().locator("button.conversation-list-main-hit").click();

    await expect(page.locator("section.dashboard-chat")).toBeVisible();
    await expect(page.locator("header.chat-header")).toBeVisible();
    await expect(page.locator("footer.chat-composer")).toBeVisible();

    const textarea = page.getByLabel("Message text");
    await expect(textarea).toBeVisible();

    const sendBtn = page.locator("footer.chat-composer button.composer-send-btn");
    await expect(sendBtn).toBeVisible();

    const attachLabel = page.locator("footer.chat-composer label.composer-attach-btn");
    await expect(attachLabel).toBeVisible();
    await expect(attachLabel).toContainText("Attach");

    const fileInput = page.locator("footer.chat-composer input[type='file']");
    await expect(fileInput).toHaveCount(1);
    await expect(fileInput).toBeAttached();
    const accept = (await fileInput.getAttribute("accept")) ?? "";
    expect(accept.includes("image/jpeg") || accept.includes("image/png") || accept.includes("image/webp")).toBe(true);
    expect(accept.includes("application/pdf")).toBe(true);

    const ownershipHint = page.locator(".composer-ownership-hint");
    const instagramPdfHint = page.getByText(/Instagram DM: text or JPEG\/PNG\/WEBP images\. PDF is not supported yet\./i);
    const hintVisible = await ownershipHint.isVisible().catch(() => false);
    const igHintVisible = await instagramPdfHint.isVisible().catch(() => false);
    const sendEnabled = await sendBtn.isEnabled();

    // Any of these states is acceptable for a read-only smoke on staging data:
    // - composer enabled
    // - disabled with ownership hint
    // - Instagram capability hint visible
    expect(sendEnabled || hintVisible || igHintVisible).toBe(true);

    // Never send in this smoke.
    expect(mutationResponses.length, "Read-only composer smoke must not trigger send/follow-up/status/assignment mutations").toBe(0);
  });
});
