/**
 * Phase II-D1-D.2 — Auth & Team Member E2E smoke (Playwright).
 *
 * v1 does not delete test users: `e2e-sales-*@<domain>` rows may accumulate in staging;
 * periodic manual cleanup may be required. Never run destructive cleanup against production.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
    await page.getByTestId("team-member-drawer-save").click();

    const banner = page.getByTestId("team-members-banner");
    await expect(banner).toContainText("Team member and login account created");

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
});
