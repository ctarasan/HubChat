/**
 * Launch readiness smoke (Playwright) — read-only by default.
 *
 * Consolidates key operator checks across dashboard, channel settings, and ops runtime.
 * Never sends messages, uploads files, or mutates conversation/channel state.
 */
import { expect, test, type Page, type Request, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"] as const;
const JWT_FRAGMENT_RE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./;
const BEARER_RE = /Bearer\s+\S+/i;
const STACK_TRACE_RE = /\s+at\s+.+\(.+?:\d+:\d+\)/;

function missingEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function isConversationsGet(res: Response): boolean {
  if (res.request().method() !== "GET") return false;
  try {
    return new URL(res.url()).pathname === "/api/conversations";
  } catch {
    return false;
  }
}

function isChannelSettingsGet(res: Response): boolean {
  if (res.request().method() !== "GET") return false;
  try {
    return new URL(res.url()).pathname === "/api/channel-settings";
  } catch {
    return false;
  }
}

function isOpsRuntimeGet(res: Response): boolean {
  if (res.request().method() !== "GET") return false;
  try {
    return new URL(res.url()).pathname === "/api/ops/runtime";
  } catch {
    return false;
  }
}

function isMutationRequest(req: Request): boolean {
  const method = req.method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    const { pathname } = new URL(req.url());
    if (method === "POST" && pathname === "/api/messages/send") return true;
    if (method === "POST" && /^\/api\/messages\/upload-/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(follow-up|assignment|status|lead-status)$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/channel-settings\//.test(pathname)) return true;
    if (method === "POST" && /\/api\/channel-settings\/[^/]+\/test-connection$/.test(pathname)) return true;
    if (method === "POST" && pathname === "/api/sales-agents") return true;
    if (method === "PATCH" && /\/api\/sales-agents\/[^/]+$/.test(pathname)) return true;
    if (method === "POST" && pathname === "/api/setup/supabase-token") return true;
    return false;
  } catch {
    return false;
  }
}

function assertOperatorSafeText(text: string, context: string): void {
  expect(text, `${context} must not expose stack traces`).not.toMatch(STACK_TRACE_RE);
  expect(text, `${context} must not expose bearer tokens`).not.toMatch(BEARER_RE);
  expect(text, `${context} must not expose JWT fragments`).not.toMatch(JWT_FRAGMENT_RE);
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Launch readiness smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("ADMIN can verify dashboard, channel settings, and ops runtime safely", async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL!.trim();
    const password = process.env.E2E_ADMIN_PASSWORD!.trim();
    const mutationRequests: string[] = [];
    page.on("request", (req) => {
      if (!isMutationRequest(req)) return;
      mutationRequests.push(`${req.method()} ${req.url()}`);
    });

    await login(page, email, password);

    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.getByTestId("nav-team-members")).toBeVisible();
    await expect(page.getByTestId("nav-ops-runtime")).toBeVisible();
    await expect(page.getByTestId("nav-channel-settings")).toBeVisible();
    await expect(page.locator("main.dashboard-root")).toBeVisible();

    const listPromise = page.waitForResponse(isConversationsGet, { timeout: 60_000 });
    await page.getByRole("button", { name: "Reload" }).click();
    const listRes = await listPromise;
    expect(listRes.status()).not.toBe(500);
    expect(listRes.ok()).toBe(true);
    const dashboardText = await page.locator("main.dashboard-root").innerText();
    assertOperatorSafeText(dashboardText, "Dashboard");

    const rows = page.locator(".conversation-list-item");
    if ((await rows.count()) > 0) {
      await rows.first().locator("button.conversation-list-main-hit").click();
      await expect(page.locator("header.chat-header")).toBeVisible();
      await expect(page.locator("footer.chat-composer")).toBeVisible();
      await expect(page.getByTestId("chat-header-actions-open")).toBeVisible();
      await page.getByTestId("chat-header-actions-open").click();
      await expect(page.getByTestId("chat-header-actions-menu")).toBeVisible();
      await expect(page.getByTestId("chat-action-follow-up")).toBeVisible();
      await page.getByTestId("chat-action-follow-up").click();
      await expect(page.getByTestId("follow-up-editor-panel")).toBeVisible();
      await page.getByTestId("chat-action-follow-up").click();
      await expect(page.getByTestId("follow-up-editor-panel")).toHaveCount(0);
    }

    await page.getByTestId("nav-channel-settings").click();
    await page.waitForURL(/\/dashboard\/channel-settings$/, { timeout: 30_000 });
    await expect(page.getByTestId("channel-settings-page")).toBeVisible();
    const channelGet = await page.waitForResponse(isChannelSettingsGet, { timeout: 60_000 });
    expect(channelGet.ok()).toBe(true);
    await expect(page.getByTestId("channel-test-connection-line")).toBeVisible();
    await expect(page.getByTestId("channel-test-connection-facebook")).toBeVisible();
    await expect(page.getByTestId("channel-test-connection-instagram")).toBeVisible();
    const lineSecretInput = page.getByTestId("secret-input-channel_access_token").first();
    await expect(lineSecretInput).toHaveAttribute("type", "password");
    await expect(lineSecretInput).toHaveValue("");

    await page.getByTestId("nav-ops-runtime").click();
    await page.waitForURL(/\/dashboard\/ops$/, { timeout: 30_000 });
    await expect(page.getByTestId("ops-runtime-page")).toBeVisible();
    const opsRes = await page.waitForResponse(isOpsRuntimeGet, { timeout: 60_000 });
    expect(opsRes.ok()).toBe(true);
    const opsBody = (await opsRes.json()) as {
      data?: {
        queueInbound?: { pending?: number; processing?: number; staleProcessing?: number; deadLetter?: number };
        queueOutbound?: { pending?: number; processing?: number; staleProcessing?: number; deadLetter?: number };
      };
    };
    expect(typeof opsBody.data?.queueInbound?.deadLetter).toBe("number");
    expect(typeof opsBody.data?.queueOutbound?.deadLetter).toBe("number");
    await expect(page.getByTestId("ops-runtime-triage-hint")).toBeVisible();
    await expect(page.getByTestId("ops-runtime-refresh")).toBeVisible();
    await page.getByTestId("ops-runtime-refresh").click();
    expect((await page.waitForResponse(isOpsRuntimeGet, { timeout: 60_000 })).ok()).toBe(true);

    expect(mutationRequests, "Launch readiness smoke must remain read-only").toHaveLength(0);
  });

  test("MANAGER and SALES role paths remain restricted as expected when env exists", async ({ page }) => {
    const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
    const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
    if (managerEmail && managerPassword) {
      await login(page, managerEmail, managerPassword);
      await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
      await expect(page.getByTestId("dashboard-inbox-filter-panel")).toBeVisible();
      await expect(page.getByTestId("nav-ops-runtime")).toHaveCount(0);
      await page.goto("/dashboard/channel-settings");
      await expect(page.getByTestId("channel-settings-access-denied")).toBeVisible({ timeout: 30_000 });
    }

    const salesEmail = process.env.E2E_SALES_EMAIL?.trim();
    const salesPassword = process.env.E2E_SALES_PASSWORD?.trim();
    if (salesEmail && salesPassword) {
      await login(page, salesEmail, salesPassword);
      await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
      await expect(page.getByTestId("inbox-scope-sales-hint")).toBeVisible();
      await expect(page.getByTestId("nav-team-members")).toHaveCount(0);
      await expect(page.getByTestId("nav-ops-runtime")).toHaveCount(0);
      await expect(page.getByTestId("nav-channel-settings")).toHaveCount(0);
    }
  });
});
