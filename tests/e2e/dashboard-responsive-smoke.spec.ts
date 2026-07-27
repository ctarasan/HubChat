/**
 * Responsive Dashboard UI smoke (Playwright) — read-only.
 *
 * Verifies inbox/chat/composer shell usability across desktop, tablet, and mobile viewports.
 * Does not send messages, upload files, or mutate conversation state.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;

/** Aligns with INBOX-MOBILE-1 breakpoints: mobile <768, tablet 768–1023, desktop ≥1024. */
const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 720 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 }
] as const;

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

async function assertDashboardShell(page: Page, viewportLabel: string): Promise<void> {
  await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
  await expect(page.locator("main.dashboard-root")).toBeVisible();
  await expect(page.locator(".conversation-list[role='list']")).toBeVisible();

  if (viewportLabel === "desktop") {
    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.getByTestId("appearance-menu-trigger")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  } else {
    await expect(page.getByTestId("mobile-inbox-header")).toBeVisible();
    await expect(page.getByTestId("mobile-inbox-overflow-trigger")).toBeVisible();
  }
}

async function reloadConversations(page: Page, viewportLabel: string): Promise<Response> {
  const listPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
  if (viewportLabel === "desktop") {
    await page.getByRole("button", { name: "Reload" }).click();
  } else {
    await page.reload();
  }
  return listPromise;
}

async function assertConversationOrEmptyState(page: Page, viewportLabel: string): Promise<void> {
  const rows = page.locator(".conversation-list-item");
  const rowCount = await rows.count();

  if (rowCount === 0) {
    await expect(page.getByText("No conversations loaded.")).toBeVisible();
    return;
  }

  await rows.first().locator("button.conversation-list-main-hit").click();
  await expect(page.locator("section.dashboard-chat")).toBeVisible();
  await expect(page.locator("header.chat-header")).toBeVisible();
  await expect(page.locator("footer.chat-composer")).toBeVisible();
  await expect(page.getByLabel("Message text")).toBeAttached();

  if (viewportLabel === "mobile") {
    await expect(page.getByTestId("mobile-back-btn")).toBeVisible();
  } else if (viewportLabel === "tablet") {
    await expect(page.getByTestId("mobile-back-btn")).toHaveCount(0);
  }
}

test.describe("Dashboard responsive smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test.describe.configure({ mode: "serial" });

  test("dashboard shell usable on desktop, tablet, and mobile without mutations", async ({ page }) => {
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

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard");
      await assertDashboardShell(page, viewport.label);

      const listRes = await reloadConversations(page, viewport.label);
      expect(
        listRes.status(),
        `[${viewport.label}] GET /api/conversations must not return 500, got ${listRes.status()}`
      ).not.toBe(500);
      expect(
        listRes.ok(),
        `[${viewport.label}] GET /api/conversations failed with status ${listRes.status()}`
      ).toBe(true);

      await assertConversationOrEmptyState(page, viewport.label);
    }

    expect(
      mutationResponses.length,
      "Read-only responsive smoke must not trigger send/follow-up/assignment/status mutations"
    ).toBe(0);
  });
});
