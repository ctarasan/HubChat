/**
 * Read-only Dashboard smoke for SALES role (Playwright).
 *
 * Does not send messages, update status, assign/reassign, or PATCH follow-up.
 */
import { expect, test, type Page, type Response } from "@playwright/test";

const REQUIRED = ["E2E_BASE_URL", "E2E_SALES_EMAIL", "E2E_SALES_PASSWORD"] as const;

function missingEnv(): string[] {
  return REQUIRED.filter((n) => !process.env[n]?.trim());
}

function resolveSalesCreds(): { email: string; password: string } | null {
  const email = process.env.E2E_SALES_EMAIL?.trim();
  const password = process.env.E2E_SALES_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
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
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/follow-up$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/assignment$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(status|lead-status)$/.test(pathname)) return true;
    if (method === "POST" && pathname === "/api/messages/send") return true;
    return false;
  } catch {
    return false;
  }
}

async function loginAsSales(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

async function assertComposerOwnershipState(page: Page): Promise<"can_reply" | "blocked"> {
  const sendBtn = page.locator("footer.chat-composer button.composer-send-btn");
  await expect(sendBtn).toBeVisible();
  const ownershipHint = page.locator(".composer-ownership-hint");

  if (await sendBtn.isEnabled()) {
    await expect(ownershipHint).toHaveCount(0);
    return "can_reply";
  }

  await expect(ownershipHint).toBeVisible();
  const hintText = ((await ownershipHint.textContent()) ?? "").trim();
  expect(
    /not assigned to you yet|assigned to another sales agent|not active for this tenant/i.test(hintText),
    `Unexpected composer ownership hint: ${hintText}`
  ).toBe(true);
  return "blocked";
}

test.describe("Dashboard SALES smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("SALES inbox loads with role restrictions and composer ownership", async ({ page }) => {
    const creds = resolveSalesCreds();
    if (!creds) {
      test.skip(true, "E2E_SALES_EMAIL and E2E_SALES_PASSWORD required");
      return;
    }

    const mutations: Response[] = [];
    page.on("response", (response) => {
      if (isMutationRequest(response)) mutations.push(response);
    });

    await loginAsSales(page, creds.email, creds.password);

    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toBeVisible();
    await expect(page.getByTestId("dashboard-inbox-column")).toBeVisible();

    await expect(page.getByTestId("nav-team-members")).toHaveCount(0);
    await expect(page.getByTestId("nav-ops-runtime")).toHaveCount(0);
    await expect(page.getByTestId("nav-channel-settings")).toHaveCount(0);

    await expect(page.getByTestId("inbox-scope-sales-hint")).toBeVisible();
    await expect(page.getByTestId("inbox-scope-mine")).toHaveCount(0);
    await expect(page.getByTestId("inbox-scope-team")).toHaveCount(0);
    await expect(page.getByTestId("inbox-scope-unassigned")).toHaveCount(0);

    await expect(page.getByRole("group", { name: "Conversation status filter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();

    let lastListUrl = "";
    const conversationsPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes("/api/conversations")) {
        lastListUrl = req.url();
      }
    });

    await page.getByRole("button", { name: "Reload" }).click();
    const conversationsResponse = await conversationsPromise;
    const status = conversationsResponse.status();

    expect(status, `GET /api/conversations must not return 500, got ${status}`).not.toBe(500);
    expect(conversationsResponse.ok(), `GET /api/conversations failed with status ${status}`).toBe(true);
    expect(lastListUrl).toContain("scope=mine");

    const body = (await conversationsResponse.json()) as { pageInfo?: { nextCursor?: string | null } };
    expect(body.pageInfo).toBeTruthy();

    const list = page.locator(".conversation-list[role='list']");
    await expect(list).toBeVisible();

    const rows = page.locator(".conversation-list-item");
    const rowCount = await rows.count();

    if (rowCount === 0) {
      await expect(page.getByText("No conversations loaded.")).toBeVisible();
    } else {
      let pickedUnassigned = false;
      for (let i = 0; i < rowCount; i += 1) {
        const row = rows.nth(i);
        const assignmentText = ((await row.locator(".conversation-list-assignment").textContent()) ?? "").trim();
        if (!assignmentText.includes("Unassigned")) continue;
        await row.locator("button.conversation-list-main-hit").click();
        await expect(page.locator("section.dashboard-chat")).toBeVisible();
        await expect(page.locator("header.chat-header")).toBeVisible();
        await expect(page.locator("footer.chat-composer")).toBeVisible();
        expect(await assertComposerOwnershipState(page)).toBe("blocked");
        pickedUnassigned = true;
        break;
      }

      if (!pickedUnassigned) {
        await rows.first().locator("button.conversation-list-main-hit").click();
        await expect(page.locator("section.dashboard-chat")).toBeVisible();
        await expect(page.locator("header.chat-header")).toBeVisible();
        await expect(page.locator("footer.chat-composer")).toBeVisible();
        await expect(page.getByLabel("Message text")).toBeVisible();
        const ownership = await assertComposerOwnershipState(page);
        expect(ownership === "can_reply" || ownership === "blocked").toBe(true);
      }
    }

    let channelSettingsGetCount = 0;
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes("/api/channel-settings")) {
        channelSettingsGetCount += 1;
      }
    });

    await page.goto("/dashboard/channel-settings");
    await expect(page.getByTestId("channel-settings-access-denied")).toBeVisible({ timeout: 30_000 });
    expect(channelSettingsGetCount).toBe(0);

    expect(mutations.length, "Read-only SALES smoke must not trigger conversation/message mutations").toBe(0);
  });
});
