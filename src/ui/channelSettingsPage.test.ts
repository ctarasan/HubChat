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
});

test("Test connection button calls POST test-connection endpoint per channel", () => {
  assert.equal(pageSource.includes("testConnectionPath"), true);
  assert.equal(pageSource.includes('method: "POST"'), true);
  assert.ok(pageSource.includes("testConnectionPath(channel)"));
  assert.ok(pageSource.includes('data-testid={`channel-test-connection-${channelPathParam(channel)}`}'));
  assert.equal(modelSource.includes("/test-connection"), true);
});

test("Test connection shows per-channel loading and feedback", () => {
  assert.equal(pageSource.includes("testBusyChannel"), true);
  assert.match(pageSource, /Testing…/);
  assert.equal(pageSource.includes("channel-test-feedback"), true);
  assert.equal(pageSource.includes('data-testid={`channel-test-feedback-'), true);
  assert.equal(pageSource.includes("applyTestConnectionToView"), true);
  assert.equal(pageSource.includes("parseTestConnectionResponse"), true);
  assert.equal(pageSource.includes("buildTestConnectionFeedback"), true);
  assert.equal(pageSource.includes("testFeedbackCssClass"), true);
});

test("health meta uses last verified and last error display helpers", () => {
  assert.equal(pageSource.includes("formatLastVerifiedDisplay"), true);
  assert.equal(pageSource.includes("formatLastErrorDisplay"), true);
  assert.equal(pageSource.includes("Never verified"), false);
  assert.equal(pageSource.includes('data-testid={`channel-last-error-'), true);
  assert.equal(pageSource.includes("statusHealthHint"), true);
  assert.equal(pageSource.includes("channel-health-hint"), true);
});

test("secret inputs bind to transient draft state for typing and paste", () => {
  assert.equal(pageSource.includes("readSecretDraftValue"), true);
  assert.equal(pageSource.includes('value={readSecretDraftValue(secretInputs[channel], field.patchKey)}'), true);
  assert.equal(pageSource.includes('value=""'), false);
  assert.equal(pageSource.includes("onPaste"), false);
  assert.equal(pageSource.includes("preventDefault"), false);
  assert.equal(pageSource.includes("maxLength"), false);
});

test("reload and successful save clear local secret draft", () => {
  assert.ok(pageSource.includes("setSecretInputs({})"));
  assert.ok(pageSource.includes("setSecretInputs((prev) => ({ ...prev, [channel]: emptySecretInputs() }))"));
  const testFn = pageSource.slice(pageSource.indexOf("async function testConnection"));
  assert.equal(testFn.includes("setSecretInputs"), false);
});

test("status and secret state badges are rendered", () => {
  assert.equal(pageSource.includes("statusCssClass"), true);
  assert.equal(pageSource.includes("secretPresenceCssClass"), true);
  assert.equal(pageSource.includes('data-testid={`channel-status-'), true);
  assert.match(pageSource, /Leave blank to keep existing secret/i);
});

test("clear secret requires explicit confirmation", () => {
  assert.equal(pageSource.includes("globalThis.confirm"), true);
  assert.equal(pageSource.includes("requestClearSecret"), true);
});

test("Facebook and Instagram provider metadata inputs render with test ids", () => {
  assert.equal(pageSource.includes("channelSupportsProviderMetadata"), true);
  assert.equal(pageSource.includes("metaProviderFieldLabels"), true);
  assert.equal(pageSource.includes("showProviderFields"), true);
  assert.ok(pageSource.includes('data-testid={`channel-provider-page-id-${channelPathParam(channel)}`}'));
  assert.ok(pageSource.includes('data-testid={`channel-provider-account-name-${channelPathParam(channel)}`}'));
  assert.ok(pageSource.includes('data-testid={`channel-provider-fields-${channelPathParam(channel)}`}'));
  const providerBlock = pageSource.slice(
    pageSource.indexOf("channel-settings-provider"),
    pageSource.indexOf("channel-settings-secrets")
  );
  assert.equal(providerBlock.includes("channel === \"LINE\""), false);
});

test("clear secret uses canonical stateKey and cancels on replacement input", () => {
  assert.equal(pageSource.includes("field.stateKey"), true);
  assert.equal(pageSource.includes("isPendingSecretClear"), true);
  assert.equal(pageSource.includes("stateKeyForPatchKey"), true);
  assert.ok(pageSource.includes("[patchKey]: \"\""));
});

test("secret inputs never prefill stored secrets and fingerprints are not rendered", () => {
  assert.equal(pageSource.includes("fingerprint"), false);
  assert.equal(pageSource.includes("sanitizeUserFacingError"), true);
  assert.equal(pageSource.includes("lastError"), true);
  assert.equal(pageSource.includes("readSecretDraftValue(baselines"), false);
});

test("Channel Settings page has no polling and manual Reload", () => {
  assert.equal(pageSource.includes("setInterval"), false);
  assert.equal(pageSource.includes('data-testid="channel-settings-reload"'), true);
});

test("non-admin path does not call channel-settings list API", () => {
  const loadIdx = pageSource.indexOf("const loadSettings = useCallback");
  assert.ok(loadIdx >= 0);
  const loadBlock = pageSource.slice(loadIdx, loadIdx + 400);
  assert.match(loadBlock, /me\.role\s*!==\s*"ADMIN"/);
});
