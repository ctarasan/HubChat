/**
 * Read-only Dashboard / Team Inbox smoke (Playwright).
 *
 * Does not send messages, update conversation status, assign/reassign,
 * or PATCH follow-up on conversations.
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
  if (adminEmail && adminPassword) {
    return { email: adminEmail, password: adminPassword, role: "ADMIN" };
  }
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) {
    return { email: managerEmail, password: managerPassword, role: "MANAGER" };
  }
  return null;
}

function missingDashboardEnv(): string[] {
  const missing = [...missingBaseEnv()];
  if (!resolveLoginCreds()) {
    missing.push("E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD");
  }
  return missing;
}

function isConversationsListGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    const { pathname } = new URL(response.url());
    return pathname === "/api/conversations";
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

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Dashboard smoke (read-only)", () => {
  const missing = missingDashboardEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("Dashboard loads, conversations API OK, inbox shell read-only", async ({ page }) => {
    const creds = resolveLoginCreds();
    if (!creds) {
      test.skip(true, "No Admin or Manager credentials configured");
      return;
    }

    const followUpPatches: Response[] = [];
    page.on("response", (response) => {
      if (isFollowUpPatch(response)) followUpPatches.push(response);
    });

    await loginAs(page, creds.email, creds.password);

    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();

    const conversationsPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
    await page.getByRole("button", { name: "Reload" }).click();
    const conversationsResponse = await conversationsPromise;
    const status = conversationsResponse.status();

    expect(status, `GET /api/conversations must not return 500, got ${status}`).not.toBe(500);
    expect(conversationsResponse.ok(), `GET /api/conversations failed with status ${status}`).toBe(true);

    const conversationsBody = (await conversationsResponse.json()) as {
      pageInfo?: { nextCursor?: string | null };
    };
    expect(conversationsBody.pageInfo).toBeTruthy();

    const list = page.locator(".conversation-list[role='list']");
    await expect(list).toBeVisible();

    const rows = page.locator(".conversation-list-item");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      await expect(page.getByText("No conversations loaded.")).toBeVisible();
    } else {
      await rows.first().locator("button.conversation-list-main-hit").click();
      await expect(page.locator("section.dashboard-chat")).toBeVisible();
      await expect(page.locator("header.chat-header")).toBeVisible();
      await expect(page.locator("footer.chat-composer")).toBeVisible();
      await expect(page.getByLabel("Message text")).toBeVisible();
    }

    if (creds.role === "ADMIN" || creds.role === "MANAGER") {
      await expect(page.getByRole("tablist", { name: "Inbox filter" })).toBeVisible();
    }
    await expect(page.getByRole("group", { name: "Conversation status filter" })).toBeVisible();

    await expect(page.getByRole("button", { name: /^Set follow-up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Clear follow-up/i })).toHaveCount(0);
    await expect(page.locator("[href*='follow-up']")).toHaveCount(0);

    expect(
      followUpPatches.length,
      "Read-only smoke must not trigger PATCH /api/conversations/*/follow-up"
    ).toBe(0);
  });
});
