import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(new URL("./ChannelSettingsPage.tsx", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("./channelSettingsModel.ts", import.meta.url), "utf8");

test("Channel Settings page is ADMIN-only and fetches /api/channel-settings", () => {
  assert.equal(pageSource.includes('data-testid="channel-settings-page"'), true);
  assert.equal(pageSource.includes("/api/channel-settings"), true);
  assert.equal(pageSource.includes('meContext.role !== "ADMIN"'), true);
  assert.equal(pageSource.includes('data-testid="channel-settings-access-denied"'), true);
});

test("GET and PATCH include x-tenant-id via fetchWithTenantHeaders", () => {
  assert.match(pageSource, /"x-tenant-id":\s*tenantId/);
  assert.ok(pageSource.includes('fetchWithTenantHeaders(s, tenantId, "/api/channel-settings")'));
  assert.ok(pageSource.includes("fetchWithTenantHeaders("));
  assert.ok(pageSource.includes("`/api/channel-settings/${channelPathParam(channel)}`"));
});

test("status and secret state badges are rendered", () => {
  assert.equal(pageSource.includes("statusCssClass"), true);
  assert.equal(pageSource.includes("secretPresenceCssClass"), true);
  assert.equal(pageSource.includes('data-testid={`channel-status-'), true);
  assert.equal(pageSource.includes('data-testid={`secret-state-'), true);
  assert.match(pageSource, /Leave blank to keep existing secret/i);
});

test("clear secret requires explicit confirmation", () => {
  assert.equal(pageSource.includes("globalThis.confirm"), true);
  assert.equal(pageSource.includes("requestClearSecret"), true);
  assert.equal(modelSource.includes("clearSecrets"), true);
});

test("secret inputs stay blank in DOM and are not prefilled from API", () => {
  assert.match(pageSource, /type="password"[\s\S]*?value=""/);
  assert.equal(pageSource.includes("secretState"), true);
  assert.equal(pageSource.includes("secretStateForField"), true);
  assert.equal(pageSource.includes("fingerprint"), false);
});

test("Channel Settings page has no polling and manual load/save", () => {
  assert.equal(pageSource.includes("setInterval"), false);
  assert.equal(pageSource.includes('data-testid="channel-settings-reload"'), true);
  assert.equal(pageSource.includes("loadSettings"), true);
});

test("non-admin path does not call channel-settings list API", () => {
  const loadIdx = pageSource.indexOf("const loadSettings = useCallback");
  assert.ok(loadIdx >= 0);
  const loadBlock = pageSource.slice(loadIdx, loadIdx + 400);
  assert.match(loadBlock, /me\.role\s*!==\s*"ADMIN"/);
  const effectBlock = pageSource.slice(pageSource.indexOf("void loadSettings()") - 120, pageSource.indexOf("void loadSettings()") + 80);
  assert.match(effectBlock, /meContext\.role\s*!==\s*"ADMIN"/);
});
