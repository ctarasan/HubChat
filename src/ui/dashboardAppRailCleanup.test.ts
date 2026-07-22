import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildDashboardNavItems } from "./dashboardAppRailModel.js";
import { DashboardAppRailSetupLink } from "./DashboardAppRail.js";

const railSource = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./dashboardAppRailModel.ts", import.meta.url), "utf8");
const iconsSource = readFileSync(new URL("./dashboardNavIcons.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");
const teamSource = readFileSync(new URL("./TeamMembersPage.tsx", import.meta.url), "utf8");

function assertNoSettingsInRail(role: "ADMIN" | "MANAGER" | "SALES", placeholders: boolean) {
  const items = buildDashboardNavItems({ role, showInboxPlaceholders: placeholders });
  assert.equal(items.some((i) => i.label === "Settings"), false);
  assert.equal(items.some((i) => i.testId === "nav-settings-disabled"), false);
  assert.equal(items.some((i) => i.testId === "nav-settings"), false);
}

test("Settings is absent from visible rail for all roles including inbox placeholders", () => {
  for (const role of ["ADMIN", "MANAGER", "SALES"] as const) {
    assertNoSettingsInRail(role, false);
    assertNoSettingsInRail(role, true);
  }
  assert.equal(modelSource.includes('id: "settings"'), false);
  assert.equal(modelSource.includes("nav-settings-disabled"), false);
  assert.equal(railSource.includes(">Settings<"), false);
});

test("Setup rail link export remains but renders nothing; Setup route retained", () => {
  assert.equal(DashboardAppRailSetupLink(), null);
  assert.ok(existsSync(new URL("../../app/setup/page.tsx", import.meta.url)));
  assert.equal(railSource.includes('href="/setup"'), false);
  assert.equal(railSource.includes(">Setup<"), false);
  assert.match(railSource, /DashboardAppRailSetupLink\(\): null/);
});

test("Sign out icon button uses accessible name Sign out without Out label", () => {
  const btnBlock = railSource.slice(
    railSource.indexOf("export function DashboardAppRailSignOutButton"),
    railSource.indexOf("export function DashboardAppRailReloadButton")
  );
  assert.match(btnBlock, /type="button"/);
  assert.match(btnBlock, /aria-label="Sign out"/);
  assert.match(btnBlock, /title="Sign out"/);
  assert.match(btnBlock, /data-testid=\{testId\}/);
  assert.match(btnBlock, /aria-hidden="true"/);
  assert.match(btnBlock, /name="log-out"/);
  assert.equal(btnBlock.includes(">Out<"), false);
  assert.equal(btnBlock.includes("app-rail-nav-label"), false);
  assert.match(iconsSource, /case "log-out"/);
  assert.match(iconsSource, /polyline points="16 17 21 12 16 7"/);
});

test("manual Sign out clears session and replaces Login without session_expired", () => {
  assert.match(dashboardSource, /DashboardAppRailSignOutButton/);
  assert.match(dashboardSource, /clearSessionConfig\(globalThis\.localStorage\)/);
  assert.match(dashboardSource, /window\.location\.replace\("\/login"\)/);
  const signOutSlice = dashboardSource.slice(
    dashboardSource.indexOf("DashboardAppRailSignOutButton"),
    dashboardSource.indexOf("DashboardAppRailSignOutButton") + 450
  );
  assert.doesNotMatch(signOutSlice, /session_expired/);
  assert.match(teamSource, /DashboardAppRailSignOutButton/);
  assert.match(teamSource, /clearSessionConfig/);
});

test("lower utility order is Appearance then Reload then Sign out", () => {
  const appearanceIdx = railSource.indexOf("<AppearanceMenu");
  const footerIdx = railSource.indexOf("{footer}");
  assert.ok(appearanceIdx > 0 && footerIdx > appearanceIdx);
  const dashFooter = dashboardSource.slice(
    dashboardSource.indexOf("footer={"),
    dashboardSource.indexOf("footer={") + 900
  );
  const reloadIdx = dashFooter.indexOf("DashboardAppRailReloadButton");
  const signOutIdx = dashFooter.indexOf("DashboardAppRailSignOutButton");
  assert.ok(reloadIdx >= 0 && signOutIdx > reloadIdx);
});

test("Sign out CSS uses warning hover with compact hit target; idle is not danger red", () => {
  assert.match(globalsSource, /\.dashboard-sign-out\.app-rail-footer-btn/);
  assert.match(globalsSource, /min-height:\s*36px/);
  assert.match(globalsSource, /--warning-text/);
  assert.match(globalsSource, /--warning-muted-bg/);
  const blockStart = globalsSource.indexOf(".dashboard-sign-out.app-rail-footer-btn {");
  assert.ok(blockStart >= 0);
  const idleBlock = globalsSource.slice(blockStart, blockStart + 350);
  assert.doesNotMatch(idleBlock, /--danger-color/);
  assert.match(idleBlock, /var\(--inbox-muted\)/);
});

test("main rail nav ids remain for ADMIN without Settings", () => {
  const ids = buildDashboardNavItems({ role: "ADMIN" }).map((i) => i.id);
  assert.deepEqual(ids, ["inbox", "team", "ops", "leads", "sla", "analytics", "work-queue", "channels"]);
});

test("Channel Settings and Setup routes remain available", () => {
  assert.ok(existsSync(new URL("../../app/dashboard/channel-settings/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../../app/setup/page.tsx", import.meta.url)));
});
