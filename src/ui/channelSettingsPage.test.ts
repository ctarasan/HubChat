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

test("GET and PATCH fetchWithTenantHeaders include x-tenant-id from profile or session", () => {
  const helperIdx = pageSource.indexOf("async function fetchWithTenantHeaders(");
  assert.ok(helperIdx >= 0);
  const helperBlock = pageSource.slice(helperIdx, helperIdx + 500);
  assert.match(helperBlock, /"x-tenant-id":\s*tenantId/);
  assert.equal(pageSource.includes("function resolveTenantId(me"), true);
  const loadIdx = pageSource.indexOf("const loadSettings = useCallback");
  const loadBlock = pageSource.slice(loadIdx, loadIdx + 550);
  assert.match(loadBlock, /const s = session/);
  assert.match(loadBlock, /fetchWithTenantHeaders\(s, tenantId, "\/api\/channel-settings"\)/);
  assert.ok(pageSource.includes("fetchWithTenantHeaders("));
  assert.ok(pageSource.includes('`/api/channel-settings/${channelPathParam(channel)}`'));
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

test("non-admin path does not call channel-settings list API", () => {
  const loadIdx = pageSource.indexOf("const loadSettings = useCallback");
  const accessIdx = pageSource.indexOf('data-testid="channel-settings-access-denied"');
  assert.ok(loadIdx >= 0);
  const loadBlock = pageSource.slice(loadIdx, loadIdx + 400);
  assert.match(loadBlock, /me\.role\s*!==\s*"ADMIN"/);
  assert.ok(accessIdx >= 0);
  const effectBlock = pageSource.slice(pageSource.indexOf("void loadSettings()") - 120, pageSource.indexOf("void loadSettings()") + 80);
  assert.match(effectBlock, /meContext\.role\s*!==\s*"ADMIN"/);
});
