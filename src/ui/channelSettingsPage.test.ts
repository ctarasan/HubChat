import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./channelSettingsModel.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("./DashboardPage.tsx", import.meta.url), "utf8");

test("Channel Settings page is ADMIN-only and fetches /api/channel-settings", () => {
  assert.equal(pageSource.includes('data-testid="channel-settings-page"'), true);
  assert.equal(pageSource.includes("/api/channel-settings"), true);
  assert.equal(pageSource.includes('meContext.role !== "ADMIN"'), true);
  assert.equal(pageSource.includes('data-testid="channel-settings-access-denied"'), true);
});

test("Channel Settings page has no polling and manual load/save", () => {
  assert.equal(pageSource.includes("setInterval"), false);
  assert.equal(pageSource.includes('data-testid="channel-settings-reload"'), true);
  assert.equal(pageSource.includes("loadSettings"), true);
});

test("secret inputs stay blank in DOM and values are not prefilled from API", () => {
  assert.match(pageSource, /type="password"[\s\S]*?value=""/);
  assert.equal(pageSource.includes("secretsConfigured"), true);
  assert.equal(pageSource.includes("fingerprint"), true);
  assert.equal(pageSource.includes('placeholder="Enter new value to replace"'), true);
});

test("save uses PATCH and buildChannelPatchBody", () => {
  assert.equal(pageSource.includes("buildChannelPatchBody"), true);
  assert.equal(pageSource.includes('method: "PATCH"'), true);
  assert.equal(pageSource.includes("clearSecretKeys"), true);
});

test("runtime cutover copy is shown", () => {
  assert.match(pageSource, /environment configuration until runtime cutover/i);
  assert.match(pageSource, /future runtime configuration/i);
});

test("model blocks malformed config JSON before PATCH", () => {
  assert.equal(modelSource.includes("parseConfigJsonText"), true);
  assert.equal(modelSource.includes("buildChannelPatchBody"), true);
});

test("nav-channel-settings is ADMIN-only on dashboard", () => {
  assert.equal(dashboardSource.includes('data-testid="nav-channel-settings"'), true);
  const navIdx = dashboardSource.indexOf('data-testid="nav-channel-settings"');
  const adminIdx = dashboardSource.lastIndexOf('meContext?.role === "ADMIN"', navIdx);
  assert.ok(adminIdx >= 0 && adminIdx < navIdx);
});

test("globals.css shares layout tokens with channel-settings-root", () => {
  const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(globalsCss, /\.channel-settings-root\s*\{[^}]*--app-rail-width:\s*64px/s);
});
