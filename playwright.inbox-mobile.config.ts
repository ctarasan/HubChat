import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only Playwright config for INBOX-MOBILE-1 fixture E2E.
 * Starts Next on port 3017 — does not use Production.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "inbox-mobile-responsive-fixture.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3017",
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: "npx next dev -p 3017 -H 127.0.0.1",
    url: "http://127.0.0.1:3017",
    reuseExistingServer: true,
    timeout: 180_000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
