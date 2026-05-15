/**
 * Phase II-D1-D.2 — Auth & Team Member E2E smoke (Playwright).
 *
 * v1 does not delete test users: `e2e-sales-*@<domain>` rows may accumulate in staging;
 * periodic manual cleanup may be required. Never run destructive cleanup against production.
 */
import { expect, test, type Page, type Response, type TestInfo } from "@playwright/test";

const E2E_ENV_NAMES = [
  "E2E_BASE_URL",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_MANAGER_EMAIL",
  "E2E_MANAGER_PASSWORD",
  "E2E_TEST_EMAIL_DOMAIN",
  "E2E_NEW_USER_PASSWORD"
] as const;

function missingE2EEnv(): string[] {
  return E2E_ENV_NAMES.filter((n) => !process.env[n]?.trim());
}

function requiredEnv(name: (typeof E2E_ENV_NAMES)[number]): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function uniqueSalesEmail(testInfo: TestInfo): string {
  const domain = requiredEnv("E2E_TEST_EMAIL_DOMAIN");
  const id = `${Date.now()}-w${testInfo.workerIndex}`;
  return `e2e-sales-${id}@${domain}`;
}

const MAX_SAFE_ERROR_LEN = 500;

function truncateSafeMessage(s: string, max = MAX_SAFE_ERROR_LEN): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** POST /api/sales-agents (create), not PATCH /api/sales-agents/:id */
function isCreateSalesAgentsPost(response: Response): boolean {
  if (response.request().method() !== "POST") return false;
  try {
    const { pathname } = new URL(response.url());
    return pathname === "/api/sales-agents";
  } catch {
    return false;
  }
}

/**
 * Reads only top-level `error` or `message` string fields (never `detail` or other fields that may be noisy).
 */
async function readSafeJsonErrorMessage(response: Response): Promise<string> {
  const contentType = (response.headers()["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const text = (await response.text().catch(() => "")).trim();
    return text ? truncateSafeMessage(text) : `(${response.status()}, non-JSON body)`;
  }
  const json: unknown = await response.json().catch(() => ({}));
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (typeof o.error === "string" && o.error.trim().length > 0) return truncateSafeMessage(o.error);
    if (typeof o.message === "string" && o.message.trim().length > 0) return truncateSafeMessage(o.message);
  }
  return `(${response.status()}, no string error/message in JSON)`;
}

async function readDrawerApiErrorText(page: Page): Promise<string | null> {
  const drawer = page.getByTestId("team-member-drawer");
  const err = drawer.locator(".team-members-drawer-error");
  if (!(await err.isVisible().catch(() => false))) return null;
  const t = await err.textContent();
  const trimmed = t?.trim();
  return trimmed && trimmed.length > 0 ? truncateSafeMessage(trimmed) : null;
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

async function signOut(page: Page): Promise<void> {
  const team = page.getByTestId("team-members-sign-out");
  const dash = page.getByTestId("dashboard-sign-out");
  if (await team.isVisible().catch(() => false)) {
    await team.click();
  } else if (await dash.isVisible().catch(() => false)) {
    await dash.click();
  } else {
    throw new Error("No sign-out control visible (expected team-members-sign-out or dashboard-sign-out).");
  }
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

async function openTeamMembers(page: Page): Promise<void> {
  const nav = page.getByTestId("nav-team-members");
  if (await nav.isVisible().catch(() => false)) {
    await nav.click();
  } else {
    await page.goto("/dashboard/team-members");
  }
  await page.waitForURL(/\/dashboard\/team-members/, { timeout: 30_000 });
}

test.describe("Auth & Team Members smoke", () => {
  test.describe.configure({ mode: "serial" });

  const missing = missingE2EEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  let createdSalesEmail = "";

  test("A — Admin creates Sales login account", async ({ page }, testInfo) => {
    const adminEmail = requiredEnv("E2E_ADMIN_EMAIL");
    const adminPassword = requiredEnv("E2E_ADMIN_PASSWORD");
    const newUserPassword = requiredEnv("E2E_NEW_USER_PASSWORD");

    createdSalesEmail = uniqueSalesEmail(testInfo);
    const displayName = `E2E Sales ${Date.now()}`;

    await loginAs(page, adminEmail, adminPassword);
    await openTeamMembers(page);

    await page.getByTestId("team-members-add").click();
    const drawer = page.getByTestId("team-member-drawer");
    await expect(drawer).toBeVisible();

    await drawer.getByLabel("Name").fill(displayName);
    await drawer.getByLabel("Email").fill(createdSalesEmail);
    await drawer.getByLabel("Role").selectOption("SALES");
    await page.getByTestId("team-member-create-auth").check();
    await page.getByTestId("team-member-new-password").fill(newUserPassword);
    await page.getByTestId("team-member-confirm-password").fill(newUserPassword);

    const postResponsePromise = page.waitForResponse(isCreateSalesAgentsPost, { timeout: 60_000 });
    await page.getByTestId("team-member-drawer-save").click();
    const postResponse = await postResponsePromise;
    const status = postResponse.status();

    if (!postResponse.ok()) {
      const safe = await readSafeJsonErrorMessage(postResponse);
      throw new Error(`POST /api/sales-agents failed with status ${status}: ${safe}`);
    }
    expect(status, `POST /api/sales-agents should return HTTP 200, got ${status}`).toBe(200);

    const banner = page.getByTestId("team-members-banner");
    try {
      await expect(banner).toContainText("Team member and login account created", { timeout: 30_000 });
    } catch (cause) {
      const drawerErr = await readDrawerApiErrorText(page);
      const bannerVisible = await banner.isVisible().catch(() => false);
      throw new Error(
        `Success banner did not show expected text within 30s after POST /api/sales-agents (${status}). ` +
          `Banner visible: ${String(bannerVisible)}. ` +
          `Drawer API error: ${drawerErr ?? "(none or not visible)"}`,
        { cause }
      );
    }

    await signOut(page);
  });

  test("B — New Sales login; Team Members access denied", async ({ page }) => {
    const newUserPassword = requiredEnv("E2E_NEW_USER_PASSWORD");
    expect(createdSalesEmail.length).toBeGreaterThan(0);

    await loginAs(page, createdSalesEmail, newUserPassword);
    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();

    await page.goto("/dashboard/team-members");
    await expect(page.getByTestId("team-members-access-denied")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByTestId("team-members-add")).toHaveCount(0);
    await expect(page.locator("table.team-members-table")).toHaveCount(0);

    await signOut(page);
  });

  test("C — Manager: Sales-only role in drawer; roster action rules", async ({ page }) => {
    const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
    const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");

    await loginAs(page, managerEmail, managerPassword);
    await openTeamMembers(page);

    await page.getByTestId("team-members-add").click();
    const drawer = page.getByTestId("team-member-drawer");
    await expect(drawer).toBeVisible();

    const roleSelect = drawer.getByLabel("Role");
    await expect(roleSelect.locator("option")).toHaveCount(1);
    await expect(roleSelect.locator("option").first()).toHaveAttribute("value", "SALES");
    await expect(roleSelect.locator('option[value="MANAGER"]')).toHaveCount(0);
    await expect(roleSelect.locator('option[value="ADMIN"]')).toHaveCount(0);

    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).toBeHidden();

    const table = page.locator("table.team-members-table tbody");
    const managerRow = table.locator("tr").filter({ has: page.locator(".team-role-badge-manager") });
    const adminRow = table.locator("tr").filter({ has: page.locator(".team-role-badge-admin") });
    const salesRow = table.locator("tr").filter({ has: page.locator(".team-role-badge-sales") });

    if ((await managerRow.count()) > 0) {
      await expect(managerRow.first().getByRole("button", { name: "Edit" })).toBeDisabled();
    }
    if ((await adminRow.count()) > 0) {
      await expect(adminRow.first().getByRole("button", { name: "Edit" })).toBeDisabled();
    }
    if ((await salesRow.count()) > 0) {
      await expect(salesRow.first().getByRole("button", { name: "Edit" })).toBeEnabled();
    }

    await signOut(page);
  });

  test("D — Regression: inbox shell and dashboard ↔ team-members navigation", async ({ page }) => {
    const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
    const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");

    await loginAs(page, managerEmail, managerPassword);
    await expect(page.getByTestId("nav-team-inbox")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();

    await openTeamMembers(page);
    await expect(page.getByTestId("team-members-add")).toBeVisible();

    await page.getByTestId("nav-team-inbox").click();
    await page.waitForURL((u) => /\/dashboard\/?$/.test(u.pathname), { timeout: 30_000 });
    await expect(page.getByTestId("nav-team-members")).toBeVisible();

    await page.getByTestId("nav-team-members").click();
    await page.waitForURL(/\/dashboard\/team-members/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Team Members" })).toBeVisible();

    await signOut(page);
  });

  test("E — Roster scroll reaches members beyond the first visible rows", async ({ page }) => {
    const managerEmail = requiredEnv("E2E_MANAGER_EMAIL");
    const managerPassword = requiredEnv("E2E_MANAGER_PASSWORD");

    await page.setViewportSize({ width: 1366, height: 700 });

    await loginAs(page, managerEmail, managerPassword);
    await openTeamMembers(page);

    const rosterScroll = page.getByTestId("team-members-roster-scroll");
    await expect(rosterScroll).toBeVisible();

    const rows = page.locator("table.team-members-table tbody tr");
    const count = await rows.count();
    test.skip(count < 5, `Need at least 5 roster rows for scroll test; found ${count}`);

    const fifthRow = rows.nth(4);
    const scrollMetricsBefore = await rosterScroll.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }));
    expect(scrollMetricsBefore.scrollHeight).toBeGreaterThan(scrollMetricsBefore.clientHeight);
    expect(scrollMetricsBefore.clientHeight).toBeGreaterThan(0);

    const fifthRowVisibleBefore = await fifthRow.evaluate((row) => {
      const surface = row.closest('[data-testid="team-members-roster-scroll"]');
      if (!surface) return true;
      const rowRect = row.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const overlap =
        Math.min(rowRect.bottom, surfaceRect.bottom) - Math.max(rowRect.top, surfaceRect.top);
      return overlap >= Math.min(24, rowRect.height * 0.25);
    });
    expect(fifthRowVisibleBefore).toBe(false);

    await rosterScroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    });
    await fifthRow.evaluate((row) => {
      row.scrollIntoView({ block: "end", inline: "nearest" });
    });

    const scrollTopAfter = await rosterScroll.evaluate((el) => el.scrollTop);
    expect(scrollTopAfter).toBeGreaterThan(0);

    await expect
      .poll(async () =>
        fifthRow.evaluate((row) => {
          const surface = row.closest('[data-testid="team-members-roster-scroll"]');
          if (!surface) return false;
          const rowRect = row.getBoundingClientRect();
          const surfaceRect = surface.getBoundingClientRect();
          const overlap =
            Math.min(rowRect.bottom, surfaceRect.bottom) - Math.max(rowRect.top, surfaceRect.top);
          return overlap >= Math.min(24, rowRect.height * 0.25);
        })
      )
      .toBe(true);

    await signOut(page);
  });
});
