import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Load repo-root `.env.e2e.local` into `process.env` if present (gitignored). Shell vars win. */
function loadEnvE2ELocal(): void {
  const filePath = resolve(process.cwd(), ".env.e2e.local");
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvE2ELocal();

/** Hostnames that must not receive E2E traffic unless explicitly allowed. */
const PRODUCTION_LIKE_HOSTS = new Set([
  "smartkorp-hub-chat.vercel.app",
  "www.smartkorp-hub-chat.vercel.app"
]);

function assertE2EProductionGuard(): void {
  const raw = process.env.E2E_BASE_URL?.trim();
  if (!raw) return;
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${raw}`);
  }
  if (PRODUCTION_LIKE_HOSTS.has(host) && process.env.E2E_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      `E2E blocked: "${host}" is production-like. Use a staging URL, or set E2E_ALLOW_PRODUCTION=true to override (not recommended).`
    );
  }
}

assertE2EProductionGuard();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL?.trim() || undefined,
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
