/**
 * Dashboard manager filter UX (Playwright) — contract-based list queries.
 * Full API behavior depends on Agent A D2.1 backend merge/deploy.
 */
import { expect, test, type Page } from "@playwright/test";

const REQUIRED = ["E2E_BASE_URL"] as const;

function missingEnv(): string[] {
  return REQUIRED.filter((n) => !process.env[n]?.trim());
}

function resolveCreds(): { email: string; password: string } | null {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim();
  if (adminEmail && adminPassword) return { email: adminEmail, password: adminPassword };
  const managerEmail = process.env.E2E_MANAGER_EMAIL?.trim();
  const managerPassword = process.env.E2E_MANAGER_PASSWORD?.trim();
  if (managerEmail && managerPassword) return { email: managerEmail, password: managerPassword };
  return null;
}

async function loginAsManagerOrAdmin(page: Page): Promise<void> {
  const creds = resolveCreds();
  if (!creds) throw new Error("No admin/manager credentials");
  await page.goto("/login");
  await page.getByTestId("login-email").fill(creds.email);
  await page.getByTestId("login-password").fill(creds.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

function isConversationsGet(reqUrl: string): boolean {
  try {
    return new URL(reqUrl).pathname === "/api/conversations";
  } catch {
    return false;
  }
}

test.describe("Dashboard manager filters", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("scope and channel controls render for manager", async ({ page }) => {
    test.skip(!resolveCreds(), "E2E_ADMIN or E2E_MANAGER credentials required");
    await loginAsManagerOrAdmin(page);
    await expect(page.getByTestId("dashboard-inbox-filter-panel")).toBeVisible();
    await expect(page.getByTestId("inbox-scope-mine")).toBeVisible();
    await expect(page.getByTestId("inbox-scope-team")).toBeVisible();
    await expect(page.getByTestId("inbox-channel-line")).toBeVisible();
    await expect(page.getByTestId("inbox-action-needs-response")).toBeVisible();
  });

  test("selecting channel issues conversations GET with channel param", async ({ page }) => {
    test.skip(!resolveCreds(), "E2E_ADMIN or E2E_MANAGER credentials required");
    await loginAsManagerOrAdmin(page);

    let lastListUrl = "";
    page.on("request", (req) => {
      if (req.method() === "GET" && req.url().includes("/api/conversations")) {
        lastListUrl = req.url();
      }
    });

    await page.getByTestId("inbox-channel-facebook").click();
    await page.waitForTimeout(1500);
    expect(lastListUrl).toContain("channel=FACEBOOK");
    expect(lastListUrl).toContain("scope=");
    expect(lastListUrl.includes("leadStatus=")).toBe(false);
  });

  test("clear all filters resets active badges", async ({ page }) => {
    test.skip(!resolveCreds(), "E2E_ADMIN or E2E_MANAGER credentials required");
    await loginAsManagerOrAdmin(page);
    await page.getByTestId("inbox-action-needs-response").click();
    await expect(page.getByTestId("dashboard-inbox-active-filters")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("inbox-clear-all-filters").click();
    await expect(page.getByTestId("dashboard-inbox-active-filters")).toHaveCount(0);
  });

  test("advanced drawer lead/follow-up/SLA filters render and trigger list reload safely", async ({ page }) => {
    test.skip(!resolveCreds(), "E2E_ADMIN or E2E_MANAGER credentials required");
    await loginAsManagerOrAdmin(page);

    let non500Seen = false;
    page.on("response", (res) => {
      if (res.request().method() !== "GET") return;
      if (!isConversationsGet(res.url())) return;
      if (res.status() < 500) non500Seen = true;
    });

    await page.getByTestId("inbox-filters-drawer-open").click();
    await expect(page.getByTestId("inbox-filters-drawer")).toBeVisible();

    await page.getByRole("group", { name: "Lead management status filter" }).getByRole("button", { name: "In progress" }).click();
    await page.getByRole("group", { name: "Follow-up filter" }).getByRole("button", { name: "Overdue" }).click();
    await page.getByRole("group", { name: "SLA filter" }).getByRole("button", { name: "Due soon" }).click();
    await page.getByTestId("inbox-filters-drawer-apply").click();

    await expect(page.getByTestId("dashboard-inbox-active-filters")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("inbox-active-filter-leadStatus")).toBeVisible();
    await expect(page.getByTestId("inbox-active-filter-followUp")).toBeVisible();
    await expect(page.getByTestId("inbox-active-filter-sla")).toBeVisible();
    expect(non500Seen).toBe(true);
  });
});
