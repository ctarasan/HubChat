import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SMARTKORP_BRAND_ASSETS } from "./brandAssets.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("SmartKorp brand JPG assets exist in public/brand", () => {
  for (const assetPath of Object.values(SMARTKORP_BRAND_ASSETS)) {
    const file = join(repoRoot, "public", assetPath.replace(/^\/brand\//, "brand/"));
    assert.ok(existsSync(file), `missing ${file}`);
  }
});

test("login page renders SmartKorp wordmark branding", () => {
  const loginSource = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");
  assert.ok(loginSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"));
  assert.ok(loginSource.includes("hub-login-brand"));
  assert.ok(loginSource.includes('alt="SmartKorp"') || loginSource.includes("SMARTKORP_BRAND_ALT"));
});

test("DashboardAppRail renders SmartKorp compact brand mark", () => {
  const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
  assert.ok(railSource.includes("app-rail-brand-mark"));
  assert.ok(railSource.includes("SMARTKORP_BRAND_ASSETS.wordmark"));
  assert.equal(railSource.includes(">SK<"), false);
});

test("app icon uses SmartKorp stacked logo asset", () => {
  const iconPath = join(repoRoot, "app", "icon.jpg");
  assert.ok(existsSync(iconPath), "missing app/icon.jpg");
});
