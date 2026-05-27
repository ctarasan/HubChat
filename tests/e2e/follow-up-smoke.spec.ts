/**
 * Follow-up mutation smoke (Playwright) — staging / dedicated E2E tenant only.
 *
 * Mutates conversation follow-up fields via PATCH /api/conversations/:id/follow-up.
 * Does not send messages or change assignment/status.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function resolveManagerOrAdminCreds(): { email: string; password: string } | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) return { email: adminEmail, password: adminPassword };
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) return { email: managerEmail, password: managerPassword };
  return null;
}

function resolveSalesCreds(): { email: string; password: string } | null {
  const email = process.env.E2E_SALES_EMAIL?.trim();
  const password = process.env.E2E_SALES_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

function missingManagerEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveManagerOrAdminCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD");
  }
  return missing;
}

function missingSalesEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveSalesCreds()) missing.push("E2E_SALES_EMAIL/E2E_SALES_PASSWORD");
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

function isFollowUpPatch(response: Response): boolean {
  if (response.request().method() !== "PATCH") return false;
  try {
    return /\/api\/conversations\/[^/]+\/follow-up$/.test(new URL(response.url()).pathname);
  } catch {
    return false;
  }
}

function futureDatetimeLocal(hoursFromNow = 36): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

async function reloadConversations(page: Page): Promise<void> {
  const listPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
  await page.getByRole("button", { name: "Reload" }).click();
  const res = await listPromise;
  expect(res.ok(), `GET /api/conversations failed with status ${res.status()}`).toBe(true);
}

async function selectFirstConversation(page: Page): Promise<boolean> {
  const rows = page.locator(".conversation-list-item");
  if ((await rows.count()) === 0) return false;
  await rows.first().locator("button.conversation-list-main-hit").click();
  await expect(page.locator("section.dashboard-chat")).toBeVisible();
  await expect(page.locator("header.chat-header")).toBeVisible();
  return true;
}

async function openFollowUpEditor(page: Page): Promise<void> {
  await page.getByTestId("chat-header-actions-open").click();
  await expect(page.getByTestId("chat-header-actions-menu")).toBeVisible();
  await page.getByTestId("chat-action-follow-up").click();
  await expect(page.getByTestId("follow-up-editor-panel")).toBeVisible();
}

test.describe("Follow-up mutation smoke", () => {
  test.describe.configure({ mode: "serial" });

  test.describe("MANAGER or ADMIN", () => {
    const missing = missingManagerEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    test("sets follow-up, verifies after reload, then clears", async ({ page }) => {
      const creds = resolveManagerOrAdminCreds();
      if (!creds) {
        test.skip(true, "Manager or Admin credentials required");
        return;
      }

      const followUpNote = `e2e-follow-up-${Date.now()}`;
      const followUpAtLocal = futureDatetimeLocal(36);

      await loginAs(page, creds.email, creds.password);
      await reloadConversations(page);

      const hasRow = await selectFirstConversation(page);
      if (!hasRow) {
        test.skip(true, "No conversations in E2E tenant inbox");
        return;
      }

      await openFollowUpEditor(page);
      await page.locator("#follow-up-at-input").fill(followUpAtLocal);
      await page.locator("#follow-up-note-input").fill(followUpNote);

      const savePatchPromise = page.waitForResponse(
        (response) => isFollowUpPatch(response) && response.ok(),
        { timeout: 60_000 }
      );
      await page.getByRole("button", { name: "Save follow-up" }).click();
      const saveResponse = await savePatchPromise;
      expect(saveResponse.status()).toBe(200);

      await expect(page.locator(".conv-header-followup-inline")).toContainText(followUpNote, { timeout: 15_000 });
      await expect(page.locator(".chat-header-badges .followup-state")).toContainText(/Follow-up/i);

      await reloadConversations(page);
      await selectFirstConversation(page);
      await expect(page.locator(".conv-header-followup-inline")).toContainText(followUpNote);
      await expect(
        page.locator(".conversation-list-item-active .conversation-list-inbox-badges").getByText(/Follow-up/i)
      ).toBeVisible();

      await openFollowUpEditor(page);
      const clearPatchPromise = page.waitForResponse(
        (response) => isFollowUpPatch(response) && response.ok(),
        { timeout: 60_000 }
      );
      await page.getByRole("button", { name: "Clear follow-up" }).click();
      const clearResponse = await clearPatchPromise;
      expect(clearResponse.status()).toBe(200);

      await expect(page.locator(".conv-header-followup-inline")).toHaveCount(0, { timeout: 15_000 });

      await reloadConversations(page);
      await selectFirstConversation(page);
      await expect(page.locator(".conv-header-followup-inline")).toHaveCount(0);
      await expect(
        page.locator(".conversation-list-item-active .conversation-list-inbox-badges").getByText(/^Follow-up/i)
      ).toHaveCount(0);
    });
  });

  test.describe("SALES wrong assignee", () => {
    const missing = missingSalesEnv();
    test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

    test("cannot open follow-up editor when not assigned to conversation", async ({ page }) => {
      const creds = resolveSalesCreds();
      if (!creds) {
        test.skip(true, "E2E_SALES_EMAIL and E2E_SALES_PASSWORD required");
        return;
      }

      await loginAs(page, creds.email, creds.password);
      await reloadConversations(page);

      const rows = page.locator(".conversation-list-item");
      const rowCount = await rows.count();
      if (rowCount === 0) {
        test.skip(true, "No conversations in E2E tenant inbox");
        return;
      }

      let blockedRowIndex = -1;
      for (let i = 0; i < rowCount; i += 1) {
        await rows.nth(i).locator("button.conversation-list-main-hit").click();
        await expect(page.locator("section.dashboard-chat")).toBeVisible();
        const hint = page.locator(".composer-ownership-hint");
        if (!(await hint.isVisible())) continue;
        const hintText = ((await hint.textContent()) ?? "").trim();
        if (
          /not assigned to you yet|assigned to another sales agent/i.test(hintText)
        ) {
          blockedRowIndex = i;
          break;
        }
      }

      if (blockedRowIndex < 0) {
        test.skip(true, "No unassigned or wrong-assignee conversation for SALES in E2E tenant");
        return;
      }

      await page.getByTestId("chat-header-actions-open").click();
      await expect(page.getByTestId("chat-header-actions-menu")).toBeVisible();
      await expect(page.getByTestId("chat-action-follow-up")).toHaveCount(0);
      await expect(page.getByTestId("follow-up-editor-panel")).toHaveCount(0);
    });
  });
});
