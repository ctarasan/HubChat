/**
 * Production inbox regression smoke (Playwright) — read-only.
 *
 * Verifies Team Inbox shell, conversations list API, reload stability, and chat/composer
 * accessibility after PR #93 inbox stability changes. Does not send messages, upload files,
 * or mutate conversation state.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

const LEGACY_EMPTY_COPY = "No conversations loaded.";

function missingBaseEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

type LoginCreds = { email: string; password: string };

function resolveLoginCreds(): LoginCreds | null {
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
    if (method === "POST" && /^\/api\/messages\/upload-/.test(pathname)) return true;
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

async function assertDashboardShell(page: Page): Promise<void> {
  await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
  await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
  await expect(page.locator("main.dashboard-root")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.locator(".conversation-list[role='list']")).toBeVisible();
}

async function assertNoWhiteScreen(page: Page): Promise<void> {
  await expect(page.locator("main.dashboard-root")).toBeVisible();
  await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
  await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
}

async function reloadConversations(page: Page): Promise<Response> {
  const listPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
  await page.getByRole("button", { name: "Reload" }).click();
  return listPromise;
}

async function assertConversationsApiOk(response: Response): Promise<void> {
  const status = response.status();
  expect(status, `GET /api/conversations must not return 500, got ${status}`).not.toBe(500);
  expect(response.ok(), `GET /api/conversations failed with status ${status}`).toBe(true);
}

async function assertLegacyEmptyCopyAbsent(page: Page): Promise<void> {
  await expect(page.getByText(LEGACY_EMPTY_COPY, { exact: true })).toHaveCount(0);
}

async function assertEmptyInboxState(page: Page): Promise<void> {
  await assertLegacyEmptyCopyAbsent(page);
  await expect(page.getByTestId("inbox-sidebar-empty")).toBeVisible();
  await expect(page.getByText("No conversations in this inbox yet.")).toBeVisible();
}

async function assertConversationSelected(page: Page): Promise<void> {
  await assertLegacyEmptyCopyAbsent(page);
  await expect(page.locator("section.dashboard-chat")).toBeVisible();
  await expect(page.locator("header.chat-header")).toBeVisible();
  await expect(page.locator("ul.message-list")).toBeVisible();
  await expect(page.locator("footer.chat-composer")).toBeVisible();
  await expect(page.getByLabel("Message text")).toBeAttached();
}

test.describe("Dashboard inbox regression smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test.describe.configure({ mode: "serial" });

  test("inbox shell, reload stability, and selection path without mutations", async ({ page }) => {
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
    await page.goto("/dashboard");
    await assertDashboardShell(page);
    await assertLegacyEmptyCopyAbsent(page);

    const initialListRes = await reloadConversations(page);
    await assertConversationsApiOk(initialListRes);
    await assertNoWhiteScreen(page);

    const rows = page.locator(".conversation-list-item");
    const rowCountAfterFirstReload = await rows.count();

    const secondListRes = await reloadConversations(page);
    await assertConversationsApiOk(secondListRes);
    await assertNoWhiteScreen(page);
    await expect(page.locator(".conversation-list[role='list']")).toBeVisible();

    const rowCountAfterSecondReload = await rows.count();
    expect(
      rowCountAfterSecondReload,
      "Inbox list row count should remain stable across consecutive reloads"
    ).toBe(rowCountAfterFirstReload);

    if (rowCountAfterSecondReload === 0) {
      await assertEmptyInboxState(page);
      await expect(page.locator("section.dashboard-chat")).toBeVisible();
    } else {
      await rows.first().locator("button.conversation-list-main-hit").click();
      await assertConversationSelected(page);

      const thirdListRes = await reloadConversations(page);
      await assertConversationsApiOk(thirdListRes);
      await assertNoWhiteScreen(page);
      await expect(rows).toHaveCount(rowCountAfterSecondReload);
      await assertConversationSelected(page);
    }

    const scopeTeam = page.getByTestId("inbox-scope-team");
    if (await scopeTeam.isVisible().catch(() => false)) {
      const scopeListPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
      await scopeTeam.click();
      await assertConversationsApiOk(await scopeListPromise);
      await assertNoWhiteScreen(page);
      await expect(page.locator(".conversation-list[role='list']")).toBeVisible();
    }

    expect(
      mutationResponses.length,
      "Read-only inbox regression smoke must not trigger send/upload/follow-up/assignment/status mutations"
    ).toBe(0);
  });
});
