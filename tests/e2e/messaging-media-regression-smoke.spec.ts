/**
 * Messaging & media regression smoke (Playwright) — read-only.
 *
 * Verifies composer, attachment affordances, capability hints, and operator-safe error copy
 * without sending messages or uploading files.
 */
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL"] as const;
const LEGACY_EMPTY_COPY = "No conversations loaded.";
const JWT_FRAGMENT_RE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./;
const STACK_TRACE_RE = /\s+at\s+.+\(.+?:\d+:\d+\)/;
const BEARER_RE = /Bearer\s+\S+/i;

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
    if (method === "POST" && pathname === "/api/messages/upload-image") return true;
    if (method === "POST" && pathname === "/api/messages/upload-pdf") return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/follow-up$/.test(pathname)) return true;
    if (method === "PATCH" && /\/api\/conversations\/[^/]+\/(assignment|status|lead-status)$/.test(pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function assertOperatorSafeText(text: string, label: string): void {
  expect(text, `${label} must not expose stack traces`).not.toMatch(STACK_TRACE_RE);
  expect(text, `${label} must not expose bearer tokens`).not.toMatch(BEARER_RE);
  expect(text, `${label} must not expose JWT fragments`).not.toMatch(JWT_FRAGMENT_RE);
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

async function assertPageErrorSafety(page: Page): Promise<void> {
  const rootText = await page.locator("main.dashboard-root").innerText();
  assertOperatorSafeText(rootText, "Dashboard root");
  await expect(page.getByText(LEGACY_EMPTY_COPY, { exact: true })).toHaveCount(0);
}

async function assertReadableHintIfVisible(locator: Locator, label: string): Promise<void> {
  if (!(await locator.isVisible().catch(() => false))) return;
  const text = (await locator.innerText()).trim();
  expect(text.length, `${label} should not be empty`).toBeGreaterThan(0);
  assertOperatorSafeText(text, label);
  expect(text, `${label} should not look like a raw exception dump`).not.toMatch(/^Error:\s+at\s+/);
}

async function assertEmptyInboxState(page: Page): Promise<void> {
  await expect(page.getByTestId("inbox-sidebar-empty")).toBeVisible();
  await expect(page.getByText("No conversations in this inbox yet.")).toBeVisible();
}

async function assertComposerAndMediaShell(page: Page): Promise<void> {
  await expect(page.locator("section.dashboard-chat")).toBeVisible();
  await expect(page.locator("header.chat-header")).toBeVisible();
  await expect(page.locator("ul.message-list")).toBeVisible();
  await expect(page.locator("footer.chat-composer")).toBeVisible();

  const textarea = page.getByLabel("Message text");
  await expect(textarea).toBeAttached();

  const sendBtn = page.locator("footer.chat-composer button.composer-send-btn");
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn).toContainText("Send");

  const attachLabel = page.locator("footer.chat-composer label.composer-attach-btn");
  await expect(attachLabel).toBeVisible();
  await expect(attachLabel).toContainText("Attach");

  const fileInput = page.locator("footer.chat-composer input[type='file']");
  await expect(fileInput).toHaveCount(1);
  await expect(fileInput).toBeAttached();

  const accept = (await fileInput.getAttribute("accept")) ?? "";
  expect(accept.includes("image/jpeg") || accept.includes("image/png") || accept.includes("image/webp")).toBe(
    true
  );
  expect(accept.includes("application/pdf")).toBe(true);

  await assertReadableHintIfVisible(page.locator("footer.chat-composer .composer-ownership-hint"), "Ownership hint");
  await assertReadableHintIfVisible(
    page.locator("footer.chat-composer .composer-hints .hint").filter({ hasText: /Instagram DM/i }),
    "Instagram capability hint"
  );
  await assertReadableHintIfVisible(
    page.locator("footer.chat-composer .composer-hints .hint").filter({ hasText: /Messenger/i }),
    "Facebook capability hint"
  );

  const ownershipHint = page.locator("footer.chat-composer .composer-ownership-hint");
  const instagramHint = page.getByText(/Instagram DM: text or JPEG\/PNG\/WEBP images/i);
  const sendEnabled = await sendBtn.isEnabled();
  const hintVisible = await ownershipHint.isVisible().catch(() => false);
  const igHintVisible = await instagramHint.isVisible().catch(() => false);
  expect(
    sendEnabled || hintVisible || igHintVisible,
    "Composer should be enabled or show a readable ownership/capability hint"
  ).toBe(true);
}

test.describe("Messaging media regression smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("composer, media affordances, and operator-safe copy without mutations", async ({ page }) => {
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
    await assertPageErrorSafety(page);

    const listPromise = page.waitForResponse(isConversationsListGet, { timeout: 60_000 });
    await page.getByRole("button", { name: "Reload" }).click();
    const listRes = await listPromise;

    expect(listRes.status(), `GET /api/conversations must not return 500, got ${listRes.status()}`).not.toBe(500);
    expect(listRes.ok(), `GET /api/conversations failed with status ${listRes.status()}`).toBe(true);

    const rows = page.locator(".conversation-list-item");
    const rowCount = await rows.count();

    if (rowCount === 0) {
      await assertEmptyInboxState(page);
      await assertPageErrorSafety(page);
      expect(
        mutationResponses.length,
        "Read-only messaging/media smoke must not trigger mutations when inbox is empty"
      ).toBe(0);
      return;
    }

    await rows.first().locator("button.conversation-list-main-hit").click();
    await assertComposerAndMediaShell(page);
    await assertPageErrorSafety(page);

    expect(
      mutationResponses.length,
      "Read-only messaging/media smoke must not trigger send/upload/follow-up/assignment/status mutations"
    ).toBe(0);
  });
});
