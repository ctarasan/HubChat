import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overflowSource = readFileSync(new URL("./MobileInboxOverflowMenu.tsx", import.meta.url), "utf8");
const appearanceSource = readFileSync(new URL("./AppearanceMenu.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const preferenceSource = readFileSync(new URL("./appearancePreference.ts", import.meta.url), "utf8");
const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");

test("mobile header exposes overflow menu trigger with accessible name", () => {
  assert.ok(dashboardSource.includes("MobileInboxOverflowMenu"));
  assert.ok(dashboardSource.includes('data-testid="mobile-inbox-header"'));
  assert.ok(overflowSource.includes('data-testid="mobile-inbox-overflow-trigger"'));
  assert.ok(overflowSource.includes('aria-label="More options"'));
});

test("tablet header uses the same overflow control via mobile-or-tablet branch", () => {
  assert.ok(dashboardSource.includes("(isMobile || isTablet)"));
  assert.ok(dashboardSource.includes("MobileInboxOverflowMenu"));
});

test("System Light Dark reachable through shared AppearanceMenu", () => {
  assert.ok(overflowSource.includes('variant="compact"'));
  assert.ok(overflowSource.includes("AppearanceMenu"));
  assert.ok(appearanceSource.includes('data-testid={`appearance-option-${option.value}`}'));
  assert.ok(appearanceSource.includes("APPEARANCE_OPTIONS"));
});

test("selecting appearance uses existing shared handlers and storage key", () => {
  assert.ok(appearanceSource.includes("setAppearancePreference"));
  assert.ok(appearanceSource.includes("readAppearancePreference"));
  assert.ok(preferenceSource.includes('APPEARANCE_STORAGE_KEY = "hubchat.appearance"'));
  assert.equal((preferenceSource.match(/APPEARANCE_STORAGE_KEY/g) || []).length >= 1, true);
  assert.ok(!overflowSource.includes("localStorage.setItem"));
  assert.ok(!overflowSource.includes("hubchat.appearance"));
});

test("current selected appearance is announced on trigger", () => {
  assert.ok(appearanceSource.includes("aria-label={`Appearance: ${selectedLabel}`}"));
  assert.ok(appearanceSource.includes("aria-checked={selected}"));
});

test("Sign Out still opens existing confirmation dialog", () => {
  assert.ok(overflowSource.includes("DashboardAppRailSignOutButton"));
  assert.ok(overflowSource.includes('testId="mobile-overflow-sign-out"'));
  assert.ok(railSource.includes("LogoutConfirmDialog"));
  assert.ok(railSource.includes("openDialog"));
});

test("desktop continues using App Rail AppearanceMenu", () => {
  assert.ok(railSource.includes("<AppearanceMenu />"));
  assert.ok(dashboardSource.includes("DashboardAppRail"));
  assert.ok(!dashboardSource.includes('variant="compact"'));
});

test("no duplicate appearance state or localStorage key", () => {
  assert.equal((preferenceSource.match(/hubchat\.appearance/g) || []).length, 1);
  assert.ok(!overflowSource.includes("useState<AppearancePreference"));
  assert.ok(!dashboardSource.includes("useState<AppearancePreference"));
});
