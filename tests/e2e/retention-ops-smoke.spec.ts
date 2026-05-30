/**
 * Read-only Retention Ops smoke (Playwright).
 * ADMIN only — does not save audit snapshots or execute raw payload cleanup.
 */
import { expect, test, type Page, type Request, type Response } from "@playwright/test";

const REQUIRED_BASE = ["E2E_BASE_URL", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"] as const;
const JWT_FRAGMENT_RE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./;
const BEARER_RE = /Bearer\s+\S+/i;
const STACK_TRACE_RE = /\s+at\s+.+\(.+?:\d+:\d+\)/;
const FORBIDDEN_JSON_KEY_RE =
  /"(payload_json|raw_payload|access_token|secret_json|refresh_token|messageContent|mediaUrl|signedUrl)"/i;

function missingEnv(): string[] {
  return REQUIRED_BASE.filter((n) => !process.env[n]?.trim());
}

function isRetentionDryRunGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/retention/dry-run";
  } catch {
    return false;
  }
}

function isRetentionPurgeRunsGet(response: Response): boolean {
  if (response.request().method() !== "GET") return false;
  try {
    return new URL(response.url()).pathname === "/api/retention/purge-runs";
  } catch {
    return false;
  }
}

function isRetentionMutationRequest(req: Request): boolean {
  const method = req.method();
  if (method === "GET" || method === "HEAD") return false;
  try {
    const { pathname } = new URL(req.url());
    if (method === "POST" && pathname === "/api/retention/purge-runs") return true;
    if (method === "POST" && /^\/api\/retention\/purge-runs\/[^/]+\/execute$/.test(pathname)) return true;
    if (method === "POST" && /^\/api\/retention\/purge-runs\/[^/]+\/cancel$/.test(pathname)) return true;
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

async function loginAsAdmin(page: Page): Promise<void> {
  const email = process.env.E2E_ADMIN_EMAIL!.trim();
  const password = process.env.E2E_ADMIN_PASSWORD!.trim();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
}

test.describe("Retention Ops smoke (read-only)", () => {
  const missing = missingEnv();
  test.skip(missing.length > 0, `Missing E2E env: ${missing.join(", ")}`);

  test("ADMIN can verify retention dry-run and audit panels without mutations", async ({ page }) => {
    const mutationRequests: string[] = [];
    page.on("request", (req) => {
      if (!isRetentionMutationRequest(req)) return;
      mutationRequests.push(`${req.method()} ${req.url()}`);
    });

    await loginAsAdmin(page);

    const dryRunPromise = page.waitForResponse(isRetentionDryRunGet, { timeout: 60_000 });
    const purgeRunsPromise = page.waitForResponse(isRetentionPurgeRunsGet, { timeout: 60_000 });

    await page.getByTestId("nav-ops-runtime").click();
    await page.waitForURL(/\/dashboard\/ops$/, { timeout: 30_000 });

    await expect(page.getByTestId("ops-retention-dry-run")).toBeVisible();
    await expect(page.getByTestId("ops-retention-dry-run-disclaimer")).toContainText(
      /Dry-run only\. No data will be deleted\./
    );
    await expect(page.getByTestId("ops-retention-audit-snapshots")).toBeVisible();
    await expect(page.getByTestId("ops-retention-audit-disclaimer")).toContainText(
      /Audit snapshot only\. No data will be deleted\./
    );
    await expect(page.getByText(/Manual raw payload cleanup only/i)).toBeVisible();
    await expect(page.getByText(/Media files and message history will not be purged/i)).toBeVisible();
    await expect(page.getByText(/EXECUTE RETENTION PURGE/)).toBeVisible();

    await expect(page.getByRole("button", { name: "Delete all" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Purge media/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Purge message/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /scheduler/i })).toHaveCount(0);

    const executeBtn = page.getByRole("button", { name: "Execute raw payload cleanup" });
    if ((await executeBtn.count()) > 0) {
      await expect(executeBtn.first()).toBeDisabled();
    }

    const dryRunResponse = await dryRunPromise;
    if (dryRunResponse.status() === 200) {
      const dryRunText = await dryRunResponse.text();
      assertOperatorSafeText(dryRunText, "GET /api/retention/dry-run");
      expect(dryRunText, "dry-run JSON must not include forbidden payload keys").not.toMatch(
        FORBIDDEN_JSON_KEY_RE
      );
      await expect(page.getByTestId("ops-retention-dry-run-summary")).toBeVisible();
    } else {
      await expect(page.getByTestId("ops-retention-dry-run-unavailable")).toBeVisible();
    }

    const purgeRunsResponse = await purgeRunsPromise;
    if (purgeRunsResponse.status() === 200) {
      const purgeRunsText = await purgeRunsResponse.text();
      assertOperatorSafeText(purgeRunsText, "GET /api/retention/purge-runs");
      expect(purgeRunsText, "purge-runs JSON must not include forbidden payload keys").not.toMatch(
        FORBIDDEN_JSON_KEY_RE
      );
      await expect(page.getByTestId("ops-retention-audit-history")).toBeVisible();
    } else {
      await expect(page.getByTestId("ops-retention-audit-unavailable")).toBeVisible();
    }

    await page.getByTestId("ops-retention-save-snapshot").click({ trial: true });
    expect(mutationRequests, "read-only smoke must not POST retention mutations").toEqual([]);
  });
});
